import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Post-checkout return page. IMPORTANT (§12): `status=success` from the embed is
 * NOT authoritative — the order only moves to PAID when the verified
 * `payment.succeeded` webhook is processed (Chunk 5). Here we just show the
 * submitted state and the current order status from our DB.
 */
export default async function CheckoutReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { orderId } = await params;
  const { status } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, amount_cents")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) notFound();

  const failed = status === "error";

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">
        {failed ? "Payment not completed" : "Payment submitted"}
      </h1>

      {failed ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          The checkout reported an error. You can try again from the listing.
        </p>
      ) : (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Thanks! We&apos;re confirming your payment with Whop. The order is marked{" "}
          <strong>PAID</strong> only after the verified <code>payment.succeeded</code> webhook
          arrives (Chunk 5) — never from this redirect alone.
        </p>
      )}

      <div className="rounded-lg border p-4 text-sm">
        <div>Order: {order.id}</div>
        <div>Current status: <strong>{order.status}</strong></div>
      </div>

      <div className="flex gap-4 text-sm">
        <Link href="/marketplace" className="text-blue-600 underline">
          ← Back to marketplace
        </Link>
      </div>
    </main>
  );
}
