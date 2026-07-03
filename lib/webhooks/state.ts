import type { OrderStatus } from "@/lib/database.types";

// Happy-path progression; transitions only move forward along this axis.
const HAPPY: OrderStatus[] = ["DRAFT", "PENDING_PAYMENT", "PROCESSING", "PAID", "FULFILLED", "SETTLED"];
const happyRank = (s: OrderStatus) => HAPPY.indexOf(s);

/**
 * Monotonic transition. Returns the new status, or null for "no change".
 * Guarantees (see §4): never regress the happy path, terminal-negative states are
 * sticky, and dispute freezes an active order.
 */
export function nextStatus(current: OrderStatus, target: OrderStatus): OrderStatus | null {
  if (current === target) return null;

  // sticky terminals
  if (current === "REFUNDED") return null;
  if (current === "DISPUTED") return target === "REFUNDED" ? "REFUNDED" : null;

  // negative targets
  if (target === "DISPUTED")
    return ["PROCESSING", "PAID", "FULFILLED", "SETTLED"].includes(current) ? "DISPUTED" : null;
  if (target === "REFUNDED")
    return ["PAID", "FULFILLED", "SETTLED"].includes(current) ? "REFUNDED" : null;
  if (target === "FAILED")
    return happyRank(current) >= 0 && happyRank(current) < happyRank("PAID") ? "FAILED" : null;

  // recover from a prior FAILED if a later success/pending arrives
  if (current === "FAILED") return target === "PAID" || target === "PROCESSING" ? target : null;

  // happy path: forward only
  const cr = happyRank(current);
  const tr = happyRank(target);
  return cr >= 0 && tr > cr ? target : null;
}

/** Map a Whop payment status/substatus to our target order status. */
export function paymentToTarget(
  status: string | null | undefined,
  substatus: string | null | undefined,
): OrderStatus | null {
  const sub = substatus ?? "";
  if (status === "paid" || sub === "succeeded") return "PAID";
  if (["refunded", "auto_refunded", "partially_refunded"].includes(sub)) return "REFUNDED";
  if (status === "uncollectible" || ["failed", "canceled"].includes(sub)) return "FAILED";
  if (status === "pending" || sub === "pending") return "PROCESSING";
  return null;
}
