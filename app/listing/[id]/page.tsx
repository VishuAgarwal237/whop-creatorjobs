import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  // RLS returns only active listings to the public; anything else is a 404 here.
  if (!listing) notFound();

  const buyable = listing.status === "active" && Boolean(listing.whop_plan_id);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <Link href="/marketplace" className="text-sm text-gray-500 underline">
        ← Marketplace
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{listing.title}</h1>
        {listing.description ? <p className="mt-2 text-gray-600">{listing.description}</p> : null}
        <p className="mt-3 text-lg font-medium">{usd(listing.price_cents)}</p>
      </div>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <form action={startCheckout}>
        <input type="hidden" name="listing_id" value={listing.id} />
        <button
          disabled={!buyable}
          className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300 disabled:text-gray-600"
        >
          {buyable ? "Buy now" : "Unavailable"}
        </button>
      </form>
    </main>
  );
}
