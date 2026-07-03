import Whop from "@whop/sdk";
const client = new Whop({
  apiKey: process.env.WHOP_API_KEY,
  baseURL: process.env.WHOP_BASE_URL,
  defaultHeaders: { "Api-Version-Date": process.env.WHOP_API_VERSION_DATE },
});
try {
  const me = await client.accounts.me();
  console.log("OK", JSON.stringify({ id: me.id, title: me.title, parent_account_id: me.parent_account_id }, null, 2));
} catch (e) {
  console.log("ERR status=", e?.status, "name=", e?.name, "msg=", e?.message);
}
