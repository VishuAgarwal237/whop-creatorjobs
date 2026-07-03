import Whop from "@whop/sdk";
const c = new Whop({ apiKey: process.env.WHOP_API_KEY, baseURL: process.env.WHOP_BASE_URL, defaultHeaders: { "Api-Version-Date": process.env.WHOP_API_VERSION_DATE } });
const parent = process.env.WHOP_PLATFORM_COMPANY_ID;
const stamp = Date.now();
const co = await c.companies.create({ title: `PlanCo ${stamp}`, parent_company_id: parent, email: `vishuagarwal237+pl${stamp}@gmail.com`, send_customer_emails: false });
const product = await c.products.create({ company_id: co.id, title: `PlanProbe ${stamp}`, visibility: "visible" });
console.log("product:", product.id);
async function tryPlan(label) {
  try {
    const p = await c.plans.create({ company_id: co.id, product_id: product.id, plan_type: "one_time", release_method: "buy_now", currency: "usd", initial_price: 25 });
    console.log(label, "OK plan:", p.id, "initial_price:", p.initial_price); return true;
  } catch (e) { console.log(label, "ERR", e?.status, (e?.message||"").slice(0,100)); return false; }
}
// immediate
if (!(await tryPlan("t=0"))) {
  await new Promise(r => setTimeout(r, 1500)); await tryPlan("t=1.5s");
}
// Also test inline plan_options on product create (avoids 2-step race)
try {
  const p2 = await c.products.create({ company_id: co.id, title: `Inline ${stamp}`, visibility: "visible", plan_options: { plan_type: "one_time", release_method: "buy_now", currency: "usd", initial_price: 30 } });
  console.log("inline product:", p2.id, "-> plans?", JSON.stringify(p2.plans ?? p2.plan_options ?? "n/a").slice(0,160));
} catch (e) { console.log("inline ERR", e?.status, (e?.message||"").slice(0,120)); }
