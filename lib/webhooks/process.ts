import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { whop } from "@/lib/whop";
import type { Database, OrderStatus } from "@/lib/database.types";
import { nextStatus, paymentToTarget } from "@/lib/webhooks/state";

type Admin = SupabaseClient<Database>;

/** Thrown when the order isn't in our DB yet (webhook-before-order race, §X1). */
export class OrderNotFoundError extends Error {}

function metaOrderId(obj: unknown): string | undefined {
  const m = (obj as { metadata?: Record<string, unknown> } | null)?.metadata;
  const v = m?.order_id;
  return typeof v === "string" ? v : undefined;
}

/**
 * Advance an order toward `target`, monotonically. Resolves the order by our
 * `order_id` metadata first, then by `whop_payment_id`. If neither resolves, we
 * throw so the caller can retry later (the order row may not be committed yet).
 */
async function advanceOrder(
  admin: Admin,
  args: { orderId?: string; whopPaymentId: string; membershipId?: string | null; target: OrderStatus | null },
) {
  let q = admin.from("orders").select("id, status, whop_payment_id, whop_membership_id");
  const { data: order } = args.orderId
    ? await q.eq("id", args.orderId).maybeSingle()
    : await q.eq("whop_payment_id", args.whopPaymentId).maybeSingle();

  if (!order) throw new OrderNotFoundError(args.orderId ?? args.whopPaymentId);

  const patch: Database["public"]["Tables"]["orders"]["Update"] = {};
  if (!order.whop_payment_id) patch.whop_payment_id = args.whopPaymentId;
  if (args.membershipId && !order.whop_membership_id) patch.whop_membership_id = args.membershipId;

  if (args.target) {
    const advanced = nextStatus(order.status, args.target);
    if (advanced) patch.status = advanced;
  }
  if (Object.keys(patch).length > 0) {
    await admin.from("orders").update(patch).eq("id", order.id);
  }
}

/** Resolve an order by a payment id and force a negative terminal (refund/dispute). */
async function advanceByPayment(admin: Admin, whopPaymentId: string | undefined, target: OrderStatus) {
  if (!whopPaymentId) return;
  const { data: order } = await admin
    .from("orders")
    .select("id, status")
    .eq("whop_payment_id", whopPaymentId)
    .maybeSingle();
  if (!order) return; // nothing we can do; reconciliation covers late arrivals
  const advanced = nextStatus(order.status, target);
  if (advanced) await admin.from("orders").update({ status: advanced }).eq("id", order.id);
}

/**
 * Handle one verified webhook event. Webhook = signal; for payments we re-read
 * GET /payments/{id} so the Whop API — not the payload — is the source of truth.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleWebhookEvent(admin: Admin, event: any): Promise<void> {
  switch (event.type as string) {
    case "payment.created":
    case "payment.pending":
    case "payment.failed":
    case "payment.succeeded": {
      const payment = event.data;
      const orderId = metaOrderId(payment);
      // API = truth: re-fetch; fall back to payload if the fetch fails
      const fresh = await whop.payments.retrieve(payment.id).catch(() => payment);
      const target = paymentToTarget(fresh?.status, fresh?.substatus);
      await advanceOrder(admin, {
        orderId,
        whopPaymentId: payment.id,
        membershipId: payment?.membership?.id ?? null,
        target,
      });
      return;
    }
    case "refund.created":
    case "refund.updated": {
      const pid = event.data?.payment?.id ?? event.data?.payment_id;
      await advanceByPayment(admin, pid, "REFUNDED");
      return;
    }
    case "dispute.created":
    case "dispute.updated": {
      const pid = event.data?.payment?.id ?? event.data?.payment_id;
      await advanceByPayment(admin, pid, "DISPUTED"); // freeze payout (§M3)
      return;
    }
    default:
      return; // ignore unrelated events
  }
}

/**
 * Reconciliation for a stuck order (missed/late webhook, §X1/no-ordering). Finds
 * the payment via the checkout session and advances the order from Whop's truth.
 */
export async function reconcileOrder(
  admin: Admin,
  order: { id: string; status: OrderStatus; whop_payment_id: string | null; whop_checkout_config_id: string | null },
  platformCompanyId: string,
): Promise<void> {
  let payment: { id: string; status?: string | null; substatus?: string | null } | null = null;

  if (order.whop_payment_id) {
    payment = await whop.payments.retrieve(order.whop_payment_id).catch(() => null);
  } else if (order.whop_checkout_config_id) {
    const page = await whop.payments
      .list({ company_id: platformCompanyId, checkout_configuration_ids: [order.whop_checkout_config_id] })
      .catch(() => null);
    payment = page?.data?.[0] ?? null;
  }
  if (!payment) return;

  const target = paymentToTarget(payment.status, payment.substatus);
  await advanceOrder(admin, { orderId: order.id, whopPaymentId: payment.id, target });
}
