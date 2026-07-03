import Whop from "@whop/sdk";
const c = new Whop({ apiKey: process.env.WHOP_API_KEY, baseURL: process.env.WHOP_BASE_URL, defaultHeaders: { "Api-Version-Date": process.env.WHOP_API_VERSION_DATE } });
const parent = process.env.WHOP_PLATFORM_COMPANY_ID;
const stamp = Date.now();
// 1) create a fresh connected seller
let companyId;
try {
  const co = await c.companies.create({ title: `Onboarding Probe ${stamp}`, parent_company_id: parent, email: `vishuagarwal237+ob${stamp}@gmail.com`, send_customer_emails: false, metadata: { probe: "onboarding" } });
  companyId = co.id; console.log("1) company:", co.id);
} catch (e) { console.log("1) company ERR", e?.status, e?.message?.slice(0,160)); process.exit(0); }
// 2) account_onboarding link
try {
  const link = await c.accountLinks.create({ company_id: companyId, use_case: "account_onboarding", return_url: "http://localhost:3000/seller/onboarding/return", refresh_url: "http://localhost:3000/seller/onboarding/refresh" });
  console.log("2) account-link:", JSON.stringify(link).slice(0, 220));
} catch (e) { console.log("2) account-link ERR", e?.status, e?.message?.slice(0,200)); }
// 3) ledger account readiness
try {
  const l = await c.ledgerAccounts.retrieve(companyId);
  console.log("3) ledger:", JSON.stringify({ approval: l.payments_approval_status, payout_status: l.payout_account_details?.status ?? null, withdrawable: l.treasury_balance?.total_withdrawable_balance ?? null }));
} catch (e) { console.log("3) ledger ERR", e?.status, e?.message?.slice(0,200)); }
