import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const badge: Record<string, string> = {
  PAID: "bg-green-100 text-green-800",
  FULFILLED: "bg-green-100 text-green-800",
  SETTLED: "bg-green-100 text-green-800",
  PROCESSING: "bg-amber-100 text-amber-800",
  PENDING_PAYMENT: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-800",
  REFUNDED: "bg-gray-200 text-gray-800",
  DISPUTED: "bg-red-100 text-red-800",
};

export default async function OrdersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/orders");

  // buyer reads their own orders via RLS
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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My orders</h1>
        <Link href="/marketplace" className="text-sm text-gray-500 underline">
          ← Marketplace
        </Link>
      </header>

      {(orders ?? []).length === 0 ? (
        <p className="text-sm text-gray-500">No orders yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {orders!.map((o) => (
            <li key={o.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{titleOf.get(o.listing_id) ?? "Listing"}</div>
                <div className="text-gray-500">{usd(o.amount_cents)}</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge[o.status] ?? "bg-gray-100"}`}>
                {o.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
