import Whop from "@whop/sdk";
const c = new Whop({ apiKey: process.env.WHOP_API_KEY, baseURL: process.env.WHOP_BASE_URL, defaultHeaders: { "Api-Version-Date": process.env.WHOP_API_VERSION_DATE } });
const parent = process.env.WHOP_PLATFORM_COMPANY_ID;
const stamp = Date.now();
async function tryCreate(label, companyId) {
  try {
    const p = await c.products.create({ company_id: companyId, title: `Probe ${label} ${stamp}`, visibility: "visible" });
    console.log(label, "OK product:", p.id);
    return p.id;
  } catch (e) { console.log(label, "ERR", e?.status, (e?.message||"").slice(0,120)); return null; }
}
// A) parent company
await tryCreate("PARENT", parent);
// B) fresh connected account
const co = await c.companies.create({ title: `ProbeCo ${stamp}`, parent_company_id: parent, email: `vishuagarwal237+pc${stamp}@gmail.com`, send_customer_emails: false });
console.log("connected:", co.id);
await tryCreate("CONNECTED", co.id);
