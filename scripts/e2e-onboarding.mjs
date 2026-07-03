import { createClient } from "@supabase/supabase-js";
import Whop from "@whop/sdk";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const whop = new Whop({ apiKey: process.env.WHOP_API_KEY, baseURL: process.env.WHOP_BASE_URL, defaultHeaders: { "Api-Version-Date": process.env.WHOP_API_VERSION_DATE } });
const stamp = Date.now();
const email = `vishuagarwal237+e2e${stamp}@gmail.com`;

// 1) sign up (as the app's browser client would) -> gets an authenticated session
const { data: su, error: suErr } = await sb.auth.signUp({ email, password: "password123" });
if (suErr) { console.log("signup ERR", suErr.message); process.exit(1); }
const userId = su.user.id;
console.log("1) signed up:", userId, "session?", Boolean(su.session));

// 2) insert own seller row (RLS with-check: supabase_user_id = auth.uid())
const { data: seller, error: sErr } = await sb.from("sellers").insert({ supabase_user_id: userId, email }).select().single();
if (sErr) { console.log("2) seller insert BLOCKED:", sErr.message); process.exit(1); }
console.log("2) seller row (RLS insert ok):", seller.id);

// 3) create the connected account via Whop and store it
const co = await whop.companies.create({ title: `E2E ${stamp}`, parent_company_id: process.env.WHOP_PLATFORM_COMPANY_ID, email, send_customer_emails: false, metadata: { creatorjobs_seller_id: seller.id } });
await sb.from("sellers").update({ whop_company_id: co.id }).eq("id", seller.id);
console.log("3) connected account:", co.id);

// 4) read back own seller row (RLS read) + readiness
const { data: readback } = await sb.from("sellers").select("id,email,whop_company_id,kyc_status,payout_ready").eq("id", seller.id).single();
const ledger = await whop.ledgerAccounts.retrieve(co.id).catch(() => null);
console.log("4) readback:", JSON.stringify(readback));
console.log("4) readiness:", JSON.stringify({ approval: ledger?.payments_approval_status ?? null, payout_status: ledger?.payout_account_details?.status ?? null }));

// 5) negative: a SECOND user must NOT see the first seller's row (RLS isolation)
const sb2 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
await sb2.auth.signUp({ email: `vishuagarwal237+other${stamp}@gmail.com`, password: "password123" });
const { data: leaked } = await sb2.from("sellers").select("id").eq("id", seller.id);
console.log("5) cross-user leak count (expect 0):", (leaked ?? []).length);
