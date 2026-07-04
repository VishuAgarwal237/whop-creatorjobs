"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { whop, Whop, WHOP_PLATFORM_COMPANY_ID } from "@/lib/whop";
import { reconcileOrder } from "@/lib/webhooks/process";
import { runSweep } from "@/lib/ops";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!isAdminEmail(user?.email)) throw new Error("Not authorized");
}

/** Force the full reconciliation sweep (outbox + stuck orders + payouts). */
export async function runReconciliation() {
  await requireAdmin();
  await runSweep();
  revalidatePath("/admin");
}

/** Re-check one order against Whop's payment truth and advance it. */
export async function recheckOrder(formData: FormData) {
  await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const admin = createSupabaseAdmin();
  const { data: order } = await admin
    .from("orders")
    .select("id, status, whop_payment_id, whop_checkout_config_id")
    .eq("id", orderId)
    .maybeSingle();
  if (order) await reconcileOrder(admin, order, WHOP_PLATFORM_COMPANY_ID);
  revalidatePath("/admin");
}

/**
 * Issue a full refund for an order's payment from the ops dashboard (Scenario 4:
 * act, don't just observe). We only call Whop — the resulting `refund.created`
 * webhook is what advances the order to REFUNDED and freezes the payout, keeping
 * Whop the source of truth. redirect() runs OUTSIDE the try (it throws internally).
 */
export async function refundPayment(formData: FormData) {
  await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const admin = createSupabaseAdmin();
  const { data: order } = await admin
    .from("orders")
    .select("id, whop_payment_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order?.whop_payment_id) redirect(`/admin?error=${encodeURIComponent("No Whop payment on this order to refund.")}`);

  let err: string | null = null;
  try {
    await whop.payments.refund(order!.whop_payment_id!);
  } catch (e) {
    err = e instanceof Whop.APIError ? `(${e.status}) ${e.message}` : "Refund request failed.";
  }
  if (err) redirect(`/admin?error=${encodeURIComponent(err)}`);
  redirect("/admin?refunded=1");
}

/**
 * Retry a failed payment from the ops dashboard. Re-attempts the original charge;
 * the resulting payment webhook advances the order if it succeeds.
 */
export async function retryPayment(formData: FormData) {
  await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const admin = createSupabaseAdmin();
  const { data: order } = await admin
    .from("orders")
    .select("id, whop_payment_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order?.whop_payment_id) redirect(`/admin?error=${encodeURIComponent("No Whop payment on this order to retry.")}`);

  let err: string | null = null;
  try {
    await whop.payments.retry(order!.whop_payment_id!);
  } catch (e) {
    err = e instanceof Whop.APIError ? `(${e.status}) ${e.message}` : "Retry request failed.";
  }
  if (err) redirect(`/admin?error=${encodeURIComponent(err)}`);
  redirect("/admin?retried=1");
}
