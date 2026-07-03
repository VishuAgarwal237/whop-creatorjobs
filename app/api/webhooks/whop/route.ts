import { NextResponse, type NextRequest } from "next/server";
import { whop } from "@/lib/whop";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { handleWebhookEvent, OrderNotFoundError } from "@/lib/webhooks/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whop webhook sink (Chunk 5).
 *
 * 1. VERIFY the Standard-Webhooks signature via the SDK (`webhooks.unwrap`). This
 *    also enforces the timestamp tolerance (replay protection). Bad sig → 400.
 * 2. DEDUPE on the `webhook-id` header (webhook_events UNIQUE) — at-least-once
 *    delivery means we may see an event twice.
 * 3. PROCESS best-effort inline (idempotent + monotonic). If the order isn't in
 *    our DB yet (webhook-before-order race), leave an outbox job for the cron to
 *    retry, and still return 2xx so Whop doesn't hammer us.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => (headers[k] = v));

  // 1. verify signature
  let event: unknown;
  try {
    event = whop.webhooks.unwrap(body, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 400 });
  }

  const webhookId = headers["webhook-id"];
  if (!webhookId) return NextResponse.json({ ok: false, error: "missing webhook-id" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const eventType = (event as { type?: string }).type ?? "unknown";

  // 2. dedupe
  const { error: insErr } = await admin.from("webhook_events").insert({
    whop_webhook_id: webhookId,
    event_type: eventType,
    payload: event as never,
    signature_verified: true,
  });
  if (insErr) {
    if (insErr.code === "23505") return NextResponse.json({ ok: true, deduped: true }); // already seen
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  // 3. process inline (best-effort); durable retry via outbox on failure
  try {
    await handleWebhookEvent(admin, event);
    await admin
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("whop_webhook_id", webhookId);
  } catch (e) {
    const msg = e instanceof OrderNotFoundError ? `order not found yet: ${e.message}` : String(e);
    await admin.from("webhook_events").update({ process_error: msg }).eq("whop_webhook_id", webhookId);
    await admin.from("outbox_jobs").insert({ kind: "webhook", ref_id: webhookId });
  }

  return NextResponse.json({ ok: true });
}
