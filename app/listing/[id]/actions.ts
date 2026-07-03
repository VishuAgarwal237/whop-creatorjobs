"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { Whop } from "@/lib/whop";
import { createCheckoutSession, platformFeeCents } from "@/lib/checkout";

/**
 * Start checkout for a listing (Chunk 4):
 *   1. require a signed-in buyer
 *   2. create the order row FIRST (PENDING_PAYMENT) — so a webhook can never
 *      arrive before the order exists (§12 X1)
 *   3. create a Whop checkout session carrying metadata.order_id
 *   4. send the buyer to our /checkout/[orderId] page (renders the embed)
 *
 * Orders have no INSERT RLS policy (writes are trusted server ops), so we insert
 * via the service-role client.
 */
export async function startCheckout(formData: FormData) {
  const listingId = String(formData.get("listing_id") ?? "");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect(`/login?next=${encodeURIComponent(`/listing/${listingId}`)}`);

  const { data: listing } = await supabase
    .from("listings")
    .select("id, seller_id, price_cents, whop_plan_id, status")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || listing.status !== "active" || !listing.whop_plan_id) {
    redirect(`/listing/${listingId}?error=${encodeURIComponent("This listing isn't purchasable.")}`);
  }

  // ensure a buyer row (RLS allows inserting your own)
  let { data: buyer } = await supabase
    .from("buyers")
    .select("id")
    .eq("supabase_user_id", user!.id)
    .maybeSingle();
  if (!buyer) {
    const { data: created } = await supabase
      .from("buyers")
      .insert({ supabase_user_id: user!.id, email: user!.email! })
      .select("id")
      .single();
    buyer = created;
  }

  // create the order via service role (no order INSERT policy)
  const admin = createSupabaseAdmin();
  const feeCents = platformFeeCents(listing!.price_cents);
  const { data: order, error: oErr } = await admin
    .from("orders")
    .insert({
      listing_id: listing!.id,
      buyer_id: buyer!.id,
      seller_id: listing!.seller_id,
      amount_cents: listing!.price_cents,
      application_fee_cents: feeCents,
      status: "PENDING_PAYMENT",
    })
    .select("id")
    .single();
  if (oErr) redirect(`/listing/${listingId}?error=${encodeURIComponent(oErr.message)}`);

  // create the Whop checkout session
  let sessionId: string | null = null;
  let err: string | null = null;
  try {
    const s = await createCheckoutSession({ planId: listing!.whop_plan_id!, orderId: order!.id });
    sessionId = s.sessionId;
  } catch (e) {
    err = e instanceof Whop.APIError ? `(${e.status}) ${e.message}` : "Failed to start checkout.";
  }
  if (err) redirect(`/listing/${listingId}?error=${encodeURIComponent(err)}`);

  await admin.from("orders").update({ whop_checkout_config_id: sessionId }).eq("id", order!.id);
  redirect(`/checkout/${order!.id}`);
}
