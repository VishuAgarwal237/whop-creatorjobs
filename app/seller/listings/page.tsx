import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createListing } from "./actions";

export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function SellerListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const { error, created } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: seller } = await supabase
    .from("sellers")
    .select("id, whop_company_id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  const { data: listings } = await supabase
    .from("listings")
    .select("id, title, price_cents, status, whop_plan_id, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My listings</h1>
        <Link href="/seller" className="text-sm text-gray-500 underline">
          ← Seller dashboard
        </Link>
      </header>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {created ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Listing created and mirrored to Whop ✅</p>
      ) : null}

      {!seller?.whop_company_id ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You need a connected account first. Go to the{" "}
          <Link href="/seller" className="underline">
            seller dashboard
          </Link>{" "}
          to onboard.
        </p>
      ) : (
        <section className="rounded-lg border p-4">
          <h2 className="font-medium">New listing</h2>
          <form action={createListing} className="mt-3 flex flex-col gap-3">
            <input name="title" placeholder="Listing title" className="rounded-md border px-3 py-2" />
            <textarea name="description" placeholder="Description (optional)" className="rounded-md border px-3 py-2" rows={3} />
            <input name="price" type="number" step="0.01" min="0.5" placeholder="Price (USD)" className="rounded-md border px-3 py-2" />
            <button className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
              Create listing
            </button>
          </form>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Existing listings</h2>
        {(listings ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">No listings yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {listings!.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <Link href={`/listing/${l.id}`} className="font-medium underline">
                    {l.title}
                  </Link>
                  <div className="text-gray-500">
                    {usd(l.price_cents)} · {l.status} · {l.whop_plan_id ? "Whop plan ✓" : "no plan"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
