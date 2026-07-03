import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { WHOP_PLATFORM_COMPANY_ID } from "@/lib/whop";
import { handleWebhookEvent, reconcileOrder } from "@/lib/webhooks/process";
import { releasePendingPayouts } from "@/lib/payouts";

/**
 * Reconciliation sweep, shared by the Vercel cron (/api/cron) and the ops
 * dashboard "Run reconciliation" button. All steps are idempotent:
 *   A. drain outbox_jobs (retry webhook events that failed inline)
 *   B. self-heal orders stuck in PENDING_PAYMENT/PROCESSING via Whop payments
 *   C. release payouts past their reserve window (gated on freeze + readiness)
 */
export async function runSweep() {
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
      if (ev?.payload) await handleWebhookEvent(admin, ev.payload);
      await admin.from("outbox_jobs").update({ status: "done" }).eq("id", job.id);
      await admin
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString(), process_error: null })
        .eq("whop_webhook_id", job.ref_id);
      result.retried++;
    } catch (e) {
      const attempts = job.attempts + 1;
      await admin
        .from("outbox_jobs")
        .update({
          attempts,
          last_error: String(e),
          status: attempts >= 10 ? "failed" : "pending",
          run_after: new Date(Date.now() + Math.min(attempts, 10) * 30_000).toISOString(),
        })
        .eq("id", job.id);
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
    } catch {
      /* best-effort */
    }
  }

  result.payouts = await releasePendingPayouts(admin);
  return result;
}
