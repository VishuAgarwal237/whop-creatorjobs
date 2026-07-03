import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Public marketplace. Anon visitors read only `active` listings via RLS
 * (listings_public_read).
 */
export default async function MarketplacePage() {
  const supabase = await createSupabaseServerClient();
  const { data: listings } = await supabase
    .from("listings")
    .select("id, title, description, price_cents, status")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">CreatorJobs marketplace</h1>
        <Link href="/" className="text-sm text-gray-500 underline">
          ← Home
        </Link>
      </header>

      {(listings ?? []).length === 0 ? (
        <p className="text-sm text-gray-500">No active listings yet.</p>
      ) : (
        <ul className="grid gap-3">
          {listings!.map((l) => (
            <li key={l.id} className="rounded-lg border p-4">
              <Link href={`/listing/${l.id}`} className="font-medium underline">
                {l.title}
              </Link>
              {l.description ? <p className="mt-1 text-sm text-gray-600">{l.description}</p> : null}
              <p className="mt-2 text-sm font-medium">{usd(l.price_cents)}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
