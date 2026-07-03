import { redirect } from "next/navigation";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { whop } from "@/lib/whop";
import { Container, Card, PageHeader, StatusBadge, Notice, btn, th, td } from "@/components/ui";
import type { OrderStatus } from "@/lib/database.types";
import { runReconciliation, recheckOrder } from "./actions";

export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const short = (s: string | null) => (s ? s.slice(0, 8) : "—");
const PAID_PLUS: OrderStatus[] = ["PAID", "FULFILLED", "SETTLED", "REFUNDED", "DISPUTED"];

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: "danger" }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === "danger" ? "text-[var(--danger)]" : ""}`}>{value}</div>
    </div>
  );
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminEmail(user.email)) {
    return (
      <Container size="sm" className="py-16">
        <Card>
          <h1 className="text-xl font-bold">Ops dashboard</h1>
          <div className="mt-3">
            <Notice kind="error">Not authorized. Add {user.email} to ADMIN_EMAILS.</Notice>
          </div>
        </Card>
      </Container>
    );
  }

  const admin = createSupabaseAdmin();
  const [{ data: orders }, { data: payouts }, { data: events }, ordersTotal, paidTotal, payoutTotal, whErrTotal] =
    await Promise.all([
      admin.from("orders").select("id, status, amount_cents, whop_payment_id, listing_id, created_at").order("created_at", { ascending: false }).limit(20),
      admin.from("payouts").select("id, order_id, amount_cents, status, error_code, whop_transfer_id").order("created_at", { ascending: false }).limit(20),
      admin.from("webhook_events").select("whop_webhook_id, event_type, signature_verified, processed_at, process_error, received_at").order("received_at", { ascending: false }).limit(20),
      admin.from("orders").select("*", { count: "exact", head: true }),
      admin.from("orders").select("*", { count: "exact", head: true }).in("status", PAID_PLUS),
      admin.from("payouts").select("*", { count: "exact", head: true }).in("status", ["completed", "stubbed"]),
      admin.from("webhook_events").select("*", { count: "exact", head: true }).not("process_error", "is", null),
    ]);

  const listingIds = Array.from(new Set((orders ?? []).map((o) => o.listing_id)));
  const { data: listings } = listingIds.length
    ? await admin.from("listings").select("id, title").in("id", listingIds)
    : { data: [] };
  const titleOf = new Map((listings ?? []).map((l) => [l.id, l.title]));

  const live = new Map<string, { status: string | null; substatus: string | null }>();
  await Promise.all(
    (orders ?? [])
      .filter((o) => o.whop_payment_id)
      .map(async (o) => {
        const p = await whop.payments.retrieve(o.whop_payment_id!).catch(() => null);
        if (p) live.set(o.id, { status: p.status ?? null, substatus: p.substatus ?? null });
      }),
  );

  return (
    <Container size="lg">
      <PageHeader
        title="Ops dashboard"
        subtitle="Buyer payment · order state · payout status · webhook delivery + errors — one screen."
        action={
          <form action={runReconciliation}>
            <button className={btn("dark")}>Run reconciliation</button>
          </form>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Orders" value={ordersTotal.count ?? 0} />
        <Kpi label="Paid+" value={paidTotal.count ?? 0} />
        <Kpi label="Payouts released" value={payoutTotal.count ?? 0} />
        <Kpi label="Webhook errors" value={whErrTotal.count ?? 0} tone={(whErrTotal.count ?? 0) > 0 ? "danger" : undefined} />
      </div>

      <div className="flex flex-col gap-6">
        {/* Orders */}
        <Card className="p-0">
          <h2 className="border-b border-border px-5 py-3 font-semibold">Orders</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border bg-surface">
                <tr>
                  <th className={th}>Order</th><th className={th}>Listing</th><th className={th}>Amount</th>
                  <th className={th}>Our status</th><th className={th}>Whop payment</th><th className={th}>Payment</th><th className={th} />
                </tr>
              </thead>
              <tbody>
                {(orders ?? []).map((o) => {
                  const l = live.get(o.id);
                  const mismatch = l?.status === "paid" && !PAID_PLUS.includes(o.status);
                  return (
                    <tr key={o.id} className="border-b border-border last:border-0">
                      <td className={`${td} font-mono text-muted`}>{short(o.id)}</td>
                      <td className={td}>{titleOf.get(o.listing_id) ?? "—"}</td>
                      <td className={td}>{usd(o.amount_cents)}</td>
                      <td className={td}>
                        <span className="inline-flex items-center gap-1">
                          <StatusBadge status={o.status} />
                          {mismatch ? <span title="Whop says paid">⚠️</span> : null}
                        </span>
                      </td>
                      <td className={`${td} text-muted`}>{l ? `${l.status ?? "—"} / ${l.substatus ?? "—"}` : "—"}</td>
                      <td className={`${td} font-mono text-muted`}>{short(o.whop_payment_id)}</td>
                      <td className={td}>
                        <form action={recheckOrder}>
                          <input type="hidden" name="order_id" value={o.id} />
                          <button className="text-xs font-medium text-[var(--whop-blue)] hover:underline">re-check</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Payouts */}
        <Card className="p-0">
          <h2 className="border-b border-border px-5 py-3 font-semibold">Payouts</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border bg-surface">
                <tr><th className={th}>Order</th><th className={th}>Amount</th><th className={th}>Status</th><th className={th}>Transfer</th><th className={th}>Error</th></tr>
              </thead>
              <tbody>
                {(payouts ?? []).length === 0 ? (
                  <tr><td className={`${td} text-muted`} colSpan={5}>No payouts yet.</td></tr>
                ) : (
                  payouts!.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className={`${td} font-mono text-muted`}>{short(p.order_id)}</td>
                      <td className={td}>{usd(p.amount_cents)}</td>
                      <td className={td}><StatusBadge status={p.status} label={p.status === "stubbed" ? "released (sandbox)" : undefined} /></td>
                      <td className={`${td} font-mono text-muted`}>{short(p.whop_transfer_id)}</td>
                      <td className={`${td} text-muted`}>{p.error_code ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Webhook delivery */}
        <Card className="p-0">
          <h2 className="border-b border-border px-5 py-3 font-semibold">Webhook delivery</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border bg-surface">
                <tr><th className={th}>Event</th><th className={th}>Verified</th><th className={th}>Processed</th><th className={th}>Error</th></tr>
              </thead>
              <tbody>
                {(events ?? []).length === 0 ? (
                  <tr><td className={`${td} text-muted`} colSpan={4}>No webhook events yet.</td></tr>
                ) : (
                  events!.map((e) => (
                    <tr key={e.whop_webhook_id} className="border-b border-border last:border-0">
                      <td className={`${td} font-mono`}>{e.event_type}</td>
                      <td className={td}>{e.signature_verified ? "✅" : "❌"}</td>
                      <td className={td}>{e.processed_at ? "✅" : "⏳"}</td>
                      <td className={`${td} text-[var(--danger)]`}>{e.process_error ? e.process_error.slice(0, 40) : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Container>
  );
}
