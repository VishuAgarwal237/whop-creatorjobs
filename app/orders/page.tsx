import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Container, PageHeader, StatusBadge, btn } from "@/components/ui";

export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function OrdersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/orders");

  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, amount_cents, listing_id, created_at")
    .order("created_at", { ascending: false });

  const ids = Array.from(new Set((orders ?? []).map((o) => o.listing_id)));
  const { data: listings } = ids.length
    ? await supabase.from("listings").select("id, title").in("id", ids)
    : { data: [] };
  const titleOf = new Map((listings ?? []).map((l) => [l.id, l.title]));

  return (
    <Container>
      <PageHeader title="My orders" subtitle="Track the status of work you've purchased." />

      {(orders ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-10 text-center">
          <p className="text-sm text-muted">No orders yet.</p>
          <Link href="/marketplace" className={btn("primary", "mt-4")}>
            Browse the marketplace
          </Link>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-white">
          {orders!.map((o) => (
            <li key={o.id} className="flex items-center justify-between border-b border-border px-5 py-3.5 last:border-0">
              <div>
                <div className="font-medium">{titleOf.get(o.listing_id) ?? "Listing"}</div>
                <div className="text-sm text-muted">{usd(o.amount_cents)}</div>
              </div>
              <StatusBadge status={o.status} />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
