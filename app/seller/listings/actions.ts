"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Whop } from "@/lib/whop";
import { createWhopCatalogEntry } from "@/lib/listings";

const back = (msg: string) => `/seller/listings?error=${encodeURIComponent(msg)}`;

/**
 * Create a listing (Chunk 3): persist our row, then mirror to Whop as a
 * product + one-time plan under the seller's connected account.
 */
export async function createListing(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const priceDollars = Number(formData.get("price") ?? "0");

  if (!title) redirect(back("Title is required."));
  if (!Number.isFinite(priceDollars) || priceDollars <= 0) redirect(back("Enter a price greater than 0."));
  const priceCents = Math.round(priceDollars * 100);

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

  if (!seller?.whop_company_id) {
    redirect(back("Create your connected account first (Seller dashboard → onboarding)."));
  }

  // 1. persist our row (RLS ensures seller_id belongs to this user)
  const { data: listing, error: insErr } = await supabase
    .from("listings")
    .insert({ seller_id: seller!.id, title, description, price_cents: priceCents, currency: "usd", status: "active" })
    .select()
    .single();
  if (insErr) redirect(back(insErr.message));

  // 2. mirror to Whop (outside try→redirect pattern)
  let ids: { productId: string; planId: string } | null = null;
  let whopErr: string | null = null;
  try {
    ids = await createWhopCatalogEntry({
      sellerCompanyId: seller!.whop_company_id!,
      title,
      description,
      priceCents,
      listingId: listing!.id,
    });
  } catch (e) {
    whopErr = e instanceof Whop.APIError ? `(${e.status}) ${e.message}` : "Failed to create Whop product/plan.";
  }
  if (whopErr) {
    // roll our row back to draft so it isn't shown as buyable without a Whop plan
    await supabase.from("listings").update({ status: "draft" }).eq("id", listing!.id);
    redirect(back(whopErr));
  }

  await supabase
    .from("listings")
    .update({ whop_product_id: ids!.productId, whop_plan_id: ids!.planId })
    .eq("id", listing!.id);

  redirect("/seller/listings?created=1");
}
