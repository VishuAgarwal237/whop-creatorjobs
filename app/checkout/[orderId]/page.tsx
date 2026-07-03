import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/whop";
import { CheckoutEmbed } from "./CheckoutEmbed";

export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // buyer reads their own order via RLS (orders_participant_read)
  const { data: order } = await supabase
    .from("orders")
    .select("id, amount_cents, status, whop_checkout_config_id, listing_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) notFound();

  const { data: listing } = await supabase
    .from("listings")
    .select("title, whop_plan_id")
    .eq("id", order.listing_id)
    .maybeSingle();
  if (!listing?.whop_plan_id || !order.whop_checkout_config_id) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Checkout</h1>
        <p className="text-sm text-gray-500">
          {listing.title} · {usd(order.amount_cents)}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Sandbox — pay with test card 4242 4242 4242 4242, any future expiry, any CVC.
        </p>
      </div>

      <CheckoutEmbed
        planId={listing.whop_plan_id}
        sessionId={order.whop_checkout_config_id}
        returnUrl={`${APP_URL}/checkout/${order.id}/return`}
      />
    </main>
  );
}
