import Whop from "@whop/sdk";
const c = new Whop({ apiKey: process.env.WHOP_API_KEY, baseURL: process.env.WHOP_BASE_URL, defaultHeaders: { "Api-Version-Date": process.env.WHOP_API_VERSION_DATE } });
const platform = process.env.WHOP_PLATFORM_COMPANY_ID;
const stamp = Date.now();
// platform-catalog product+plan (mirrors lib/listings.ts)
const product = await c.products.create({ company_id: platform, title: `Checkout probe ${stamp}`, visibility: "visible" });
const plan = await c.plans.create({ company_id: platform, product_id: product.id, plan_type: "one_time", release_method: "buy_now", currency: "usd", initial_price: 25 });
console.log("plan:", plan.id);
// create a checkout session with metadata.order_id (mirrors lib/checkout.ts)
const fakeOrderId = "order_test_" + stamp;
const cfg = await c.checkoutConfigurations.create({ company_id: platform, plan_id: plan.id, metadata: { order_id: fakeOrderId } });
console.log("checkout session id:", cfg.id);
console.log("purchase_url:", cfg.purchase_url);
console.log("metadata echoed:", JSON.stringify(cfg.metadata));
