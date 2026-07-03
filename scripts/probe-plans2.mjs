import Whop from "@whop/sdk";
const c = new Whop({ apiKey: process.env.WHOP_API_KEY, baseURL: process.env.WHOP_BASE_URL, defaultHeaders: { "Api-Version-Date": process.env.WHOP_API_VERSION_DATE } });
const parent = process.env.WHOP_PLATFORM_COMPANY_ID;
const stamp = Date.now();

// 1) plans.create on the PARENT company
const pp = await c.products.create({ company_id: parent, title: `ParentPlanProbe ${stamp}`, visibility: "visible" });
try {
  const plan = await c.plans.create({ company_id: parent, product_id: pp.id, plan_type: "one_time", release_method: "buy_now", currency: "usd", initial_price: 25 });
  console.log("PARENT plans.create OK:", plan.id);
} catch (e) { console.log("PARENT plans.create ERR", e?.status, (e?.message||"").slice(0,120)); }

// 2) inline plan_options — does it create a plan? inspect product + list plans
const co = await c.companies.create({ title: `InlineCo ${stamp}`, parent_company_id: parent, email: `vishuagarwal237+in${stamp}@gmail.com`, send_customer_emails: false });
const prod = await c.products.create({ company_id: co.id, title: `InlineProbe ${stamp}`, visibility: "visible", plan_options: { plan_type: "one_time", release_method: "buy_now", currency: "usd", initial_price: 30 } });
console.log("inline product keys:", Object.keys(prod).join(","));
try {
  const plans = await c.plans.list({ company_id: co.id });
  console.log("plans.list for connected co:", (plans.data ?? []).map(p => ({id:p.id, price:p.initial_price})));
} catch (e) { console.log("plans.list ERR", e?.status, (e?.message||"").slice(0,120)); }
