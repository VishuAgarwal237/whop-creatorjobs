import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Container, Card, Notice, btn } from "@/components/ui";
import { startCheckout } from "./actions";

export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: listing } = await supabase
    .from("listings")
    .select("id, title, description, price_cents, status, whop_plan_id")
    .eq("id", id)
    .maybeSingle();

  if (!listing) notFound();
  const buyable = listing.status === "active" && Boolean(listing.whop_plan_id);

  return (
    <Container size="sm">
      <Link href="/marketplace" className="text-sm text-muted transition hover:text-foreground">
        ← Marketplace
      </Link>

      <Card className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight">{listing.title}</h1>
        {listing.description ? (
          <p className="mt-2 leading-relaxed text-muted">{listing.description}</p>
        ) : null}
        <div className="mt-5 flex items-end justify-between border-t border-border pt-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Price</div>
            <div className="text-2xl font-bold">{usd(listing.price_cents)}</div>
          </div>
          <form action={startCheckout}>
            <input type="hidden" name="listing_id" value={listing.id} />
            <button disabled={!buyable} className={btn("primary", "px-6 py-2.5")}>
              {buyable ? "Buy now" : "Unavailable"}
            </button>
          </form>
        </div>
      </Card>

      {error ? (
        <div className="mt-4">
          <Notice kind="error">{error}</Notice>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Secure checkout by Whop. Payment is confirmed by a verified webhook; the seller is paid
        out from the platform ledger after a short reserve window.
      </p>
    </Container>
  );
}
