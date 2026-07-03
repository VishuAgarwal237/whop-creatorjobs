import { NextResponse, type NextRequest } from "next/server";
import { whop } from "@/lib/whop";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { handleWebhookEvent, OrderNotFoundError } from "@/lib/webhooks/process";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whop webhook sink (Chunk 5).
 *
 * 1. VERIFY the Standard-Webhooks signature via the SDK (`webhooks.unwrap`). This
 *    also enforces the timestamp tolerance (replay protection). Bad sig → 400.
 * 2. DEDUPE on the `webhook-id` header (webhook_events UNIQUE) — at-least-once
 *    delivery means we may see an event twice.
 * 3. ENQUEUE a durable outbox job BEFORE processing, so a crash/timeout mid-
 *    processing can't orphan the event — the cron always drains it.
 * 4. PROCESS best-effort inline (idempotent + monotonic) as a latency optimization;
 *    on success mark the event processed and the job done. Always return 2xx once
 *    the event is durably recorded so Whop doesn't hammer us.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => (headers[k] = v));

  const startedAt = Date.now();
  const webhookId = headers["webhook-id"];

  // 1. verify signature
  let event: unknown;
  try {
    event = whop.webhooks.unwrap(body, { headers });
  } catch (e) {
    log.warn("webhook.invalid_signature", { webhook_id: webhookId, err: e });
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 400 });
  }

  if (!webhookId) {
    log.warn("webhook.missing_id");
    return NextResponse.json({ ok: false, error: "missing webhook-id" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const eventType = (event as { type?: string }).type ?? "unknown";
  const wlog = log.child({ webhook_id: webhookId, event_type: eventType });
  wlog.info("webhook.received");

  // 2. dedupe
  const { error: insErr } = await admin.from("webhook_events").insert({
    whop_webhook_id: webhookId,
    event_type: eventType,
    payload: event as never,
    signature_verified: true,
  });
  if (insErr) {
    if (insErr.code === "23505") {
      wlog.info("webhook.deduped");
      return NextResponse.json({ ok: true, deduped: true }); // already seen
    }
    wlog.error("webhook.persist_failed", { err: insErr.message });
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  // 3. durable enqueue BEFORE processing — guarantees the cron can recover the
  //    event even if this request crashes/times out mid-processing.
  await admin.from("outbox_jobs").insert({ kind: "webhook", ref_id: webhookId });

  // 4. process inline (optimization). On success, mark processed + close the job;
  //    on failure, leave the job pending for the reconciliation cron to retry.
  try {
    await handleWebhookEvent(admin, event);
    await admin
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString(), process_error: null })
      .eq("whop_webhook_id", webhookId);
    await admin.from("outbox_jobs").update({ status: "done" }).eq("kind", "webhook").eq("ref_id", webhookId);
    wlog.info("webhook.processed", { latency_ms: Date.now() - startedAt });
  } catch (e) {
    const msg = e instanceof OrderNotFoundError ? `order not found yet: ${e.message}` : String(e);
    await admin.from("webhook_events").update({ process_error: msg }).eq("whop_webhook_id", webhookId);
    // job stays pending → cron retries with backoff
    // OrderNotFoundError is an expected race (webhook before order commit) → warn, not error.
    if (e instanceof OrderNotFoundError) wlog.warn("webhook.deferred", { reason: msg, latency_ms: Date.now() - startedAt });
    else wlog.error("webhook.process_failed", { err: e, latency_ms: Date.now() - startedAt });
  }

  return NextResponse.json({ ok: true });
}
