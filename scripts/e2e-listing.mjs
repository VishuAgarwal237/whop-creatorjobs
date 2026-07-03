import { createClient } from "@supabase/supabase-js";
import Whop from "@whop/sdk";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const whop = new Whop({ apiKey: process.env.WHOP_API_KEY, baseURL: process.env.WHOP_BASE_URL, defaultHeaders: { "Api-Version-Date": process.env.WHOP_API_VERSION_DATE } });
const platform = process.env.WHOP_PLATFORM_COMPANY_ID;
const stamp = Date.now();
const email = `vishuagarwal237+list${stamp}@gmail.com`;

const { data: su } = await sb.auth.signUp({ email, password: "password123" });
const { data: seller } = await sb.from("sellers").insert({ supabase_user_id: su.user.id, email }).select().single();
const co = await whop.companies.create({ title: `Lister ${stamp}`, parent_company_id: platform, email, send_customer_emails: false });
await sb.from("sellers").update({ whop_company_id: co.id }).eq("id", seller.id);
console.log("seller+company:", co.id);

const priceCents = 2500;
const { data: listing } = await sb.from("listings").insert({ seller_id: seller.id, title: `Logo design ${stamp}`, description: "A clean logo", price_cents: priceCents, currency: "usd", status: "active" }).select().single();
// catalog under PLATFORM company (mirrors lib/listings.ts)
const product = await whop.products.create({ company_id: platform, title: `Logo design ${stamp}`, description: "A clean logo", visibility: "visible", metadata: { listing_id: listing.id, seller_company_id: co.id } });
const plan = await whop.plans.create({ company_id: platform, product_id: product.id, plan_type: "one_time", release_method: "buy_now", currency: "usd", initial_price: priceCents / 100, metadata: { listing_id: listing.id, seller_company_id: co.id } });
await sb.from("listings").update({ whop_product_id: product.id, whop_plan_id: plan.id }).eq("id", listing.id);
console.log("listing:", listing.id, "product:", product.id, "plan:", plan.id, "initial_price:", plan.initial_price);

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: pub } = await anon.from("listings").select("id,title,price_cents,status,whop_plan_id").eq("id", listing.id);
console.log("anon sees active listing (expect 1):", (pub ?? []).length, JSON.stringify(pub?.[0] ?? {}));
