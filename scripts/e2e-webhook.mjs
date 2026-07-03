import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();

// --- seed an order via service role (bypasses RLS) ---
const { data: au } = await admin.auth.admin.createUser({ email: `wh${stamp}@gmail.com`, password: "password123", email_confirm: true });
const uid = au.user.id;
const { data: seller } = await admin.from("sellers").insert({ supabase_user_id: uid, email: `wh${stamp}@gmail.com`, whop_company_id: `biz_fake${stamp}` }).select().single();
const { data: buyer } = await admin.from("buyers").insert({ supabase_user_id: uid, email: `wh${stamp}@gmail.com` }).select().single();
const { data: listing } = await admin.from("listings").insert({ seller_id: seller.id, title: "WH test", price_cents: 4000, currency: "usd", status: "active", whop_plan_id: `plan_fake${stamp}` }).select().single();
const { data: order } = await admin.from("orders").insert({ listing_id: listing.id, buyer_id: buyer.id, seller_id: seller.id, amount_cents: 4000, application_fee_cents: 800, status: "PENDING_PAYMENT", whop_checkout_config_id: `ch_fake${stamp}` }).select().single();
console.log("seeded order:", order.id, "status:", order.status);

// --- craft + sign a Standard-Webhooks payload ---
const secret = process.env.WHOP_WEBHOOK_SECRET;
const key = Buffer.from(secret, "base64");
function post(payloadObj, msgId) {
  const body = JSON.stringify(payloadObj);
  const ts = Math.floor(Date.now() / 1000).toString();
  const signed = `${msgId}.${ts}.${body}`;
  const sig = crypto.createHmac("sha256", key).update(signed).digest("base64");
  return fetch("http://localhost:3001/api/webhooks/whop", {
    method: "POST",
    headers: { "content-type": "application/json", "webhook-id": msgId, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` },
    body,
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }));
}
const paidEvent = (pid) => ({ id: `evt_${pid}`, type: "payment.succeeded", data: { id: pid, status: "paid", substatus: "succeeded", metadata: { order_id: order.id }, membership: { id: `mem_${stamp}` } } });
const pendingEvent = (pid) => ({ id: `evt2_${pid}`, type: "payment.pending", data: { id: pid, status: "pending", substatus: "pending", metadata: { order_id: order.id } } });

const payId = `pay_${stamp}`;
// 1. bad signature check
const bad = await fetch("http://localhost:3001/api/webhooks/whop", { method: "POST", headers: { "content-type":"application/json","webhook-id":"x","webhook-timestamp":"1","webhook-signature":"v1,deadbeef" }, body: JSON.stringify(paidEvent(payId)) }).then(r=>r.status);
console.log("1) bad signature ->", bad, "(expect 400)");
// 2. deliver payment.succeeded
const r1 = await post(paidEvent(payId), `msg_${stamp}_1`);
console.log("2) succeeded ->", r1.status, JSON.stringify(r1.json));
// 3. duplicate (same webhook-id)
const r2 = await post(paidEvent(payId), `msg_${stamp}_1`);
console.log("3) duplicate ->", r2.status, JSON.stringify(r2.json), "(expect deduped)");
// 4. out-of-order pending AFTER paid (must not regress)
const r3 = await post(pendingEvent(payId), `msg_${stamp}_2`);
console.log("4) late pending ->", r3.status);

const { data: after } = await admin.from("orders").select("status, whop_payment_id, whop_membership_id").eq("id", order.id).single();
console.log("FINAL order:", JSON.stringify(after), "(expect PAID, pay id set, not regressed)");
