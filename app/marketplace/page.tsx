import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Container, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function MarketplacePage() {
  const supabase = await createSupabaseServerClient();
  const { data: listings } = await supabase
    .from("listings")
    .select("id, title, description, price_cents, status")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return (
    <Container size="lg">
      <PageHeader title="Marketplace" subtitle="Hire creators for work — pay securely through Whop." />

      {(listings ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-10 text-center">
          <p className="text-sm text-muted">No active listings yet. Sellers can create one from the dashboard.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {listings!.map((l) => (
            <li key={l.id}>
              <Link
                href={`/listing/${l.id}`}
                className="group flex h-full flex-col rounded-2xl border border-border bg-white p-5 transition hover:border-[var(--whop-blue)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
              >
                <h3 className="font-semibold group-hover:text-[var(--whop-blue)]">{l.title}</h3>
                {l.description ? (
                  <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted">{l.description}</p>
                ) : (
                  <div className="flex-1" />
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-lg font-bold">{usd(l.price_cents)}</span>
                  <span className="text-sm font-medium text-[var(--whop-blue)]">View →</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
