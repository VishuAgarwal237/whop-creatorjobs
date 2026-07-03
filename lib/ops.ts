import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { WHOP_PLATFORM_COMPANY_ID } from "@/lib/whop";
import { handleWebhookEvent, reconcileOrder } from "@/lib/webhooks/process";
import { releasePendingPayouts } from "@/lib/payouts";
import { log } from "@/lib/logger";

/**
 * Reconciliation sweep, shared by the Vercel cron (/api/cron) and the ops
 * dashboard "Run reconciliation" button. All steps are idempotent:
 *   A. drain outbox_jobs (retry webhook events that failed inline)
 *   B. self-heal orders stuck in PENDING_PAYMENT/PROCESSING via Whop payments
 *   C. release payouts past their reserve window (gated on freeze + readiness)
 */
export async function runSweep() {
  const startedAt = Date.now();
  const admin = createSupabaseAdmin();
  const result = { retried: 0, reconciled: 0, payouts: { released: 0, frozen: 0, held: 0 } };

  const { data: jobs } = await admin
    .from("outbox_jobs")
    .select("id, ref_id, attempts")
    .eq("kind", "webhook")
    .eq("status", "pending")
    .lte("run_after", new Date().toISOString())
    .limit(25);

  for (const job of jobs ?? []) {
    const { data: ev } = await admin
      .from("webhook_events")
      .select("payload")
      .eq("whop_webhook_id", job.ref_id)
      .maybeSingle();
    try {
      if (ev?.payload) await handleWebhookEvent(admin, ev.payload, "cron");
      await admin.from("outbox_jobs").update({ status: "done" }).eq("id", job.id);
      await admin
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString(), process_error: null })
        .eq("whop_webhook_id", job.ref_id);
      result.retried++;
      log.info("outbox.retry_succeeded", { webhook_id: job.ref_id, attempts: job.attempts + 1 });
    } catch (e) {
      const attempts = job.attempts + 1;
      const dead = attempts >= 10;
      await admin
        .from("outbox_jobs")
        .update({
          attempts,
          last_error: String(e),
          status: dead ? "failed" : "pending",
          run_after: new Date(Date.now() + Math.min(attempts, 10) * 30_000).toISOString(),
        })
        .eq("id", job.id);
      // A job that hits max attempts is abandoned (dead-letter). Emit at ERROR so
      // it's alertable in the log platform — a stuck webhook can mean an order
      // never reaches PAID or a payout never releases.
      if (dead) log.error("outbox.dead_letter", { webhook_id: job.ref_id, attempts, err: e });
      else log.warn("outbox.retry_failed", { webhook_id: job.ref_id, attempts, err: e });
    }
  }

  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: stuck } = await admin
    .from("orders")
    .select("id, status, whop_payment_id, whop_checkout_config_id")
    .in("status", ["PENDING_PAYMENT", "PROCESSING"])
    .lt("created_at", cutoff)
    .limit(50);

  for (const order of stuck ?? []) {
    try {
      await reconcileOrder(admin, order, WHOP_PLATFORM_COMPANY_ID);
      result.reconciled++;
    } catch (e) {
      log.warn("reconcile.failed", { order_id: order.id, status: order.status, err: e });
    }
  }

  result.payouts = await releasePendingPayouts(admin);
  log.info("sweep.completed", {
    latency_ms: Date.now() - startedAt,
    retried: result.retried,
    reconciled: result.reconciled,
    payouts_released: result.payouts.released,
    payouts_frozen: result.payouts.frozen,
    payouts_held: result.payouts.held,
  });
  return result;
}
