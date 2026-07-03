import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { whop, Whop, WHOP_PLATFORM_COMPANY_ID } from "@/lib/whop";
import type { Database } from "@/lib/database.types";
import { log } from "@/lib/logger";

type Admin = SupabaseClient<Database>;

/** Real transfers only run when explicitly enabled (sandbox disables payouts). */
export const PAYOUTS_ENABLED = process.env.PAYOUTS_ENABLED === "true";
/** Reserve/hold window before releasing a seller's funds (clawback safety, §X2). */
export const PAYOUT_RESERVE_SECONDS = Number(process.env.PAYOUT_RESERVE_SECONDS ?? "60");

/**
 * Record payout INTENT when an order is PAID (idempotent on whop_payment_id, which
 * mirrors Whop transfer idempotence — a redelivered webhook can't create a second
 * payout). Amount = order total − platform fee. Funds are NOT moved yet; release
 * happens after the reserve window (see releasePendingPayouts).
 */
export async function ensurePayoutForOrder(
  admin: Admin,
  order: {
    id: string;
    seller_id: string;
    amount_cents: number;
    application_fee_cents: number;
    whop_payment_id: string | null;
  },
): Promise<void> {
  if (!order.whop_payment_id) return; // need the payment id as the idempotence key
  const sellerShare = Math.max(0, order.amount_cents - order.application_fee_cents);

  const { error } = await admin.from("payouts").insert({
    order_id: order.id,
    seller_id: order.seller_id,
    idempotence_key: order.whop_payment_id, // UNIQUE — dedupes
    amount_cents: sellerShare,
    status: "pending",
  });
  if (error && error.code !== "23505") throw error; // 23505 = already recorded
}

/** Order states from which a payout may be released (never while frozen). */
const RELEASABLE = ["PAID", "FULFILLED", "SETTLED"];
const FROZEN = ["DISPUTED", "REFUNDED", "FAILED"];

/**
 * Release pending payouts whose reserve window has elapsed. Gated on: order not
 * frozen (dispute/refund), and — for real transfers — seller readiness. In
 * sandbox (PAYOUTS_ENABLED=false) we mark the payout `stubbed` to demonstrate the
 * flow without moving money. Idempotent: uses idempotence_key on the transfer too.
 */
export async function releasePendingPayouts(admin: Admin): Promise<{ released: number; frozen: number; held: number }> {
  const cutoff = new Date(Date.now() - PAYOUT_RESERVE_SECONDS * 1000).toISOString();
  const { data: payouts } = await admin
    .from("payouts")
    .select("id, order_id, seller_id, amount_cents, idempotence_key, status")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .limit(25);

  const result = { released: 0, frozen: 0, held: 0 };

  for (const p of payouts ?? []) {
    const { data: order } = await admin.from("orders").select("status").eq("id", p.order_id).maybeSingle();
    if (!order) continue;

    if (FROZEN.includes(order.status)) {
      await admin.from("payouts").update({ status: "failed", error_code: `frozen_${order.status}` }).eq("id", p.id);
      result.frozen++;
      log.warn("payout.frozen", { payout_id: p.id, order_id: p.order_id, order_status: order.status, amount_cents: p.amount_cents });
      continue;
    }
    if (!RELEASABLE.includes(order.status)) continue; // not payable yet

    const { data: seller } = await admin
      .from("sellers")
      .select("whop_company_id, payout_ready")
      .eq("id", p.seller_id)
      .maybeSingle();
    if (!seller?.whop_company_id) {
      result.held++;
      log.info("payout.held", { payout_id: p.id, order_id: p.order_id, reason: "no_connected_account" });
      continue;
    }

    if (!PAYOUTS_ENABLED) {
      // sandbox: payouts are disabled — simulate the release.
      await admin.from("payouts").update({ status: "stubbed" }).eq("id", p.id);
      result.released++;
      log.info("payout.stubbed", { payout_id: p.id, order_id: p.order_id, amount_cents: p.amount_cents });
      continue;
    }

    // production: require real readiness, then transfer platform → seller ledger
    if (!seller.payout_ready) {
      result.held++;
      log.info("payout.held", { payout_id: p.id, order_id: p.order_id, reason: "seller_not_payout_ready" });
      continue; // stays pending; retries once KYC/payout account is ready
    }
    try {
      const transfer = await whop.transfers.create({
        amount: p.amount_cents / 100,
        currency: "usd",
        origin_id: WHOP_PLATFORM_COMPANY_ID,
        destination_id: seller.whop_company_id,
        idempotence_key: p.idempotence_key,
        notes: `CreatorJobs order ${p.order_id}`.slice(0, 50),
      });
      await admin
        .from("payouts")
        .update({ status: "completed", whop_transfer_id: transfer.id, error_code: null })
        .eq("id", p.id);
      result.released++;
      log.info("payout.released", {
        payout_id: p.id,
        order_id: p.order_id,
        seller_id: p.seller_id,
        amount_cents: p.amount_cents,
        whop_transfer_id: transfer.id,
      });
    } catch (e) {
      const code = e instanceof Whop.APIError ? `whop_${e.status}` : "transfer_error";
      await admin.from("payouts").update({ error_code: code }).eq("id", p.id); // stays pending for retry
      result.held++;
      // Money didn't move but the seller is owed it → ERROR (alertable). The
      // structured `err` field keeps the full Whop message the error_code drops.
      log.error("payout.transfer_failed", {
        payout_id: p.id,
        order_id: p.order_id,
        seller_id: p.seller_id,
        amount_cents: p.amount_cents,
        error_code: code,
        err: e,
      });
    }
  }

  return result;
}
