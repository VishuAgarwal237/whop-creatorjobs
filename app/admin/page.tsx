import { redirect } from "next/navigation";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { whop } from "@/lib/whop";
import { runReconciliation, recheckOrder } from "./actions";

export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const short = (s: string | null) => (s ? s.slice(0, 8) : "—");
const PAID_PLUS = ["PAID", "FULFILLED", "SETTLED", "REFUNDED", "DISPUTED"];

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminEmail(user.email)) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">Ops dashboard</h1>
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Not authorized. Add {user.email} to ADMIN_EMAILS.
        </p>
      </main>
    );
  }

  const admin = createSupabaseAdmin();
  const [{ data: orders }, { data: payouts }, { data: events }] = await Promise.all([
    admin.from("orders").select("id, status, amount_cents, whop_payment_id, listing_id, created_at").order("created_at", { ascending: false }).limit(20),
    admin.from("payouts").select("id, order_id, amount_cents, status, error_code, whop_transfer_id").order("created_at", { ascending: false }).limit(20),
    admin.from("webhook_events").select("whop_webhook_id, event_type, signature_verified, processed_at, process_error, received_at").order("received_at", { ascending: false }).limit(20),
  ]);

  const listingIds = Array.from(new Set((orders ?? []).map((o) => o.listing_id)));
  const { data: listings } = listingIds.length
    ? await admin.from("listings").select("id, title").in("id", listingIds)
    : { data: [] };
  const titleOf = new Map((listings ?? []).map((l) => [l.id, l.title]));

  // Live Whop payment truth for orders that have a payment id (bounded fan-out).
  const live = new Map<string, { status: string | null; substatus: string | null }>();
  await Promise.all(
    (orders ?? [])
      .filter((o) => o.whop_payment_id)
      .map(async (o) => {
        const p = await whop.payments.retrieve(o.whop_payment_id!).catch(() => null);
        if (p) live.set(o.id, { status: p.status ?? null, substatus: p.substatus ?? null });
      }),
  );

  const th = "px-3 py-2 text-left font-medium text-gray-500";
  const td = "px-3 py-2";

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ops dashboard</h1>
          <p className="text-sm text-gray-500">
            Buyer payment · order state · payout status · webhook delivery + errors — one screen (Scenario 4).
          </p>
        </div>
        <form action={runReconciliation}>
          <button className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">Run reconciliation</button>
        </form>
      </header>

      {/* Orders + live Whop truth */}
      <section>
        <h2 className="mb-2 font-medium">Orders</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className={th}>Order</th><th className={th}>Listing</th><th className={th}>Amount</th>
                <th className={th}>Our status</th><th className={th}>Whop payment</th><th className={th}>Payment id</th><th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {(orders ?? []).map((o) => {
                const l = live.get(o.id);
                const mismatch = l?.status === "paid" && !PAID_PLUS.includes(o.status);
                return (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className={td}>{short(o.id)}</td>
                    <td className={td}>{titleOf.get(o.listing_id) ?? "—"}</td>
                    <td className={td}>{usd(o.amount_cents)}</td>
                    <td className={td}>
                      <span className={mismatch ? "font-semibold text-amber-700" : ""}>{o.status}</span>
                      {mismatch ? " ⚠️" : ""}
                    </td>
                    <td className={td}>{l ? `${l.status ?? "—"} / ${l.substatus ?? "—"}` : "—"}</td>
                    <td className={td}>{short(o.whop_payment_id)}</td>
                    <td className={td}>
                      <form action={recheckOrder}>
                        <input type="hidden" name="order_id" value={o.id} />
                        <button className="text-xs text-blue-600 underline">re-check</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payouts */}
      <section>
        <h2 className="mb-2 font-medium">Payouts</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr><th className={th}>Order</th><th className={th}>Amount</th><th className={th}>Status</th><th className={th}>Transfer</th><th className={th}>Error</th></tr>
            </thead>
            <tbody>
              {(payouts ?? []).length === 0 ? (
                <tr><td className={td} colSpan={5}>No payouts yet.</td></tr>
              ) : (
                payouts!.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className={td}>{short(p.order_id)}</td>
                    <td className={td}>{usd(p.amount_cents)}</td>
                    <td className={td}>{p.status}</td>
                    <td className={td}>{short(p.whop_transfer_id)}</td>
                    <td className={td}>{p.error_code ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Webhook delivery + errors */}
      <section>
        <h2 className="mb-2 font-medium">Webhook delivery</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr><th className={th}>Event</th><th className={th}>Verified</th><th className={th}>Processed</th><th className={th}>Error</th></tr>
            </thead>
            <tbody>
              {(events ?? []).length === 0 ? (
                <tr><td className={td} colSpan={4}>No webhook events yet.</td></tr>
              ) : (
                events!.map((e) => (
                  <tr key={e.whop_webhook_id} className="border-b last:border-0">
                    <td className={td}>{e.event_type}</td>
                    <td className={td}>{e.signature_verified ? "✅" : "❌"}</td>
                    <td className={td}>{e.processed_at ? "✅" : "⏳"}</td>
                    <td className={td}>{e.process_error ? <span className="text-red-600">{e.process_error.slice(0, 40)}</span> : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
