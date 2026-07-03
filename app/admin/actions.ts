"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { WHOP_PLATFORM_COMPANY_ID } from "@/lib/whop";
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
