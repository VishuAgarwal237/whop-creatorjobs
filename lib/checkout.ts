import "server-only";
import { whop, WHOP_PLATFORM_COMPANY_ID } from "@/lib/whop";

/** Platform take rate (basis points). Seller receives amount − fee at payout. */
export const PLATFORM_FEE_BPS = 2000; // 20%

export function platformFeeCents(amountCents: number): number {
  return Math.round((amountCents * PLATFORM_FEE_BPS) / 10000);
}

/**
 * Create a Whop checkout session for a listing's plan (Chunk 4).
 *
 * The catalog lives under the platform company (see Chunk 3 / finding V1), so the
 * checkout is created under the platform. We attach our `order_id` as metadata —
 * payments created from this session inherit it, so the webhook (Chunk 5) can map
 * the payment back to our order. The buyer's share is settled to the seller's
 * connected ledger via a transfer at payout time (Chunk 6).
 */
export async function createCheckoutSession(params: {
  planId: string;
  orderId: string;
}): Promise<{ sessionId: string; purchaseUrl: string }> {
  const cfg = await whop.checkoutConfigurations.create({
    company_id: WHOP_PLATFORM_COMPANY_ID,
    plan_id: params.planId,
    metadata: { order_id: params.orderId },
  });
  return { sessionId: cfg.id, purchaseUrl: cfg.purchase_url };
}
