import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: listing } = await supabase
    .from("listings")
    .select("id, title, description, price_cents, status, whop_plan_id")
    .eq("id", id)
    .maybeSingle();

  // RLS returns only active listings to the public; anything else is a 404 here.
  if (!listing) notFound();

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

      {/* Buy button is wired to Whop embedded checkout in Chunk 4. */}
      <button
        disabled
        className="self-start rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-600"
        title="Checkout is added in Chunk 4"
      >
        Buy (checkout — Chunk 4)
      </button>
    </main>
  );
}
