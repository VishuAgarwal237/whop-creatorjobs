"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { whop, Whop } from "@/lib/whop";
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

/**
 * Update a listing (Chunk 3). Persists title/description/price/status to our row
 * and mirrors the change to the Whop product (title/description/visibility) and
 * plan (price) so checkout charges the new amount. Whop sync is best-effort — a
 * Whop hiccup shouldn't lose the seller's edit.
 */
export async function updateListing(formData: FormData) {
  const id = String(formData.get("listing_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const priceDollars = Number(formData.get("price") ?? "0");
  const status = String(formData.get("status") ?? "active") === "archived" ? "archived" : "active";

  if (!id) redirect(back("Missing listing id."));
  if (!title) redirect(back("Title is required."));
  if (!Number.isFinite(priceDollars) || priceDollars <= 0) redirect(back("Enter a price greater than 0."));
  const priceCents = Math.round(priceDollars * 100);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/seller/listings");

  const { data: seller } = await supabase
    .from("sellers")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!seller) redirect(back("No seller profile found."));

  const { data: listing } = await supabase
    .from("listings")
    .select("id, whop_product_id, whop_plan_id")
    .eq("id", id)
    .eq("seller_id", seller.id)
    .maybeSingle();
  if (!listing) redirect(back("Listing not found (or not yours)."));

  const { error: updErr } = await supabase
    .from("listings")
    .update({ title, description, price_cents: priceCents, status })
    .eq("id", id)
    .eq("seller_id", seller.id);
  if (updErr) redirect(back(updErr.message));

  // Mirror to Whop (best-effort). visibility follows our status so an archived
  // listing is hidden on Whop too.
  try {
    if (listing.whop_product_id) {
      await whop.products.update(listing.whop_product_id, {
        title: title.slice(0, 80),
        description: description ?? undefined,
        visibility: status === "active" ? "visible" : "hidden",
      });
    }
    if (listing.whop_plan_id) {
      await whop.plans.update(listing.whop_plan_id, {
        title: title.slice(0, 80),
        description: description ?? undefined,
        initial_price: priceCents / 100,
      });
    }
  } catch (e) {
    if (!(e instanceof Whop.APIError)) throw e;
    redirect(back(`Saved locally, but Whop sync failed: (${e.status}) ${e.message}`));
  }

  redirect("/seller/listings?updated=1");
}

/**
 * Delete a listing. Removes the mirrored Whop plan + product (best-effort), then
 * hard-deletes our row. If the listing already has orders (FK), we archive it
 * instead so buyer/order history stays intact — an archived listing drops off
 * the marketplace and can't be bought.
 */
export async function deleteListing(formData: FormData) {
  const id = String(formData.get("listing_id") ?? "").trim();
  if (!id) redirect(back("Missing listing id."));

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/seller/listings");

  // Scope strictly to this user's own listing (defense-in-depth over RLS).
  const { data: seller } = await supabase
    .from("sellers")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!seller) redirect(back("No seller profile found."));

  const { data: listing } = await supabase
    .from("listings")
    .select("id, whop_product_id, whop_plan_id")
    .eq("id", id)
    .eq("seller_id", seller.id)
    .maybeSingle();
  if (!listing) redirect(back("Listing not found (or not yours)."));

  // Best-effort Whop cleanup — plan first (it belongs to the product), then product.
  // Never let a Whop hiccup block removing the listing from our marketplace.
  try {
    if (listing.whop_plan_id) await whop.plans.delete(listing.whop_plan_id);
  } catch (e) {
    if (!(e instanceof Whop.APIError)) throw e; // unexpected non-API error → surface
  }
  try {
    if (listing.whop_product_id) await whop.products.delete(listing.whop_product_id);
  } catch (e) {
    if (!(e instanceof Whop.APIError)) throw e;
  }

  const { error: delErr } = await supabase.from("listings").delete().eq("id", id).eq("seller_id", seller.id);
  if (delErr) {
    // 23503 = FK violation: orders reference this listing. Archive instead of deleting.
    if (delErr.code === "23503") {
      await supabase.from("listings").update({ status: "archived" }).eq("id", id).eq("seller_id", seller.id);
      redirect("/seller/listings?archived=1");
    }
    redirect(back(delErr.message));
  }

  redirect("/seller/listings?deleted=1");
}
