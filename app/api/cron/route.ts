import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { WHOP_PLATFORM_COMPANY_ID } from "@/lib/whop";
import { handleWebhookEvent, reconcileOrder } from "@/lib/webhooks/process";
import { releasePendingPayouts } from "@/lib/payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reconciliation sweep (Chunk 5). Two jobs, both idempotent:
 *   A. drain outbox_jobs — re-run webhook events that failed inline (e.g. the
 *      order didn't exist yet).
 *   B. self-heal orders stuck in PENDING_PAYMENT/PROCESSING by reading the payment
 *      from Whop (covers fully-missed / out-of-order deliveries).
 * Runs on a Vercel Cron (see vercel.json). Protected by CRON_SECRET when set.
 */
async function run() {
  const admin = createSupabaseAdmin();
  const result = { retried: 0, reconciled: 0, payouts: { released: 0, frozen: 0, held: 0 } };

  // A. retry failed webhook events
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

  // B. self-heal stuck orders (older than 2 minutes)
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

  // C. release payouts past their reserve window (gated on freeze + readiness)
  result.payouts = await releasePendingPayouts(admin);

  return result;
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // local/dev
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await run()) });
}
