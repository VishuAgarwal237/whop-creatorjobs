import Whop from "@whop/sdk";
const c = new Whop({ apiKey: process.env.WHOP_API_KEY, baseURL: process.env.WHOP_BASE_URL, defaultHeaders: { "Api-Version-Date": process.env.WHOP_API_VERSION_DATE } });
const parent = "biz_gV4PXJfW1rJpJU";
const stamp = Date.now();
try {
  const co = await c.companies.create({
    title: `CJ Probe Seller ${stamp}`,
    parent_company_id: parent,
    email: `vishuagarwal237+cjprobe${stamp}@gmail.com`,
    send_customer_emails: false,
    metadata: { creatorjobs_probe: "1" },
  });
  console.log("SUCCESS: connected account created ->", JSON.stringify({ id: co.id, title: co.title, parent_account_id: co.parent_account_id, verified: co.verified }, null, 2));
} catch (e) {
  console.log("BLOCKED: status=", e?.status, "name=", e?.name, "msg=", (e?.message||"").slice(0,300));
}
