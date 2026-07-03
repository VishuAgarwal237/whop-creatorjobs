import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/whop";
import { Container, Card } from "@/components/ui";
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
    <Container size="sm">
      <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>
      <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-white px-5 py-4">
        <span className="font-medium">{listing.title}</span>
        <span className="text-lg font-bold">{usd(order.amount_cents)}</span>
      </div>

      <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
        Sandbox — pay with test card <span className="font-mono">4242 4242 4242 4242</span>, any
        future expiry, any CVC.
      </p>

      <Card className="mt-4 p-3">
        <CheckoutEmbed
          planId={listing.whop_plan_id}
          sessionId={order.whop_checkout_config_id}
          returnUrl={`${APP_URL}/checkout/${order.id}/return`}
        />
      </Card>
    </Container>
  );
}
