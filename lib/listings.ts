import "server-only";
import { whop, WHOP_PLATFORM_COMPANY_ID } from "@/lib/whop";

/**
 * Mirror a CreatorJobs listing into Whop as a Product + one-time Plan.
 *
 * IMPORTANT (verified in sandbox): the platform (parent) API key can create
 * `products` for a connected account, but standalone `plans.create` for a
 * connected account returns 404 — plan creation only works on the company the
 * key owns. So we create the catalog under the PLATFORM company and tag it with
 * the seller. The seller's connected account is the *payout destination*: at
 * settlement (Chunk 6) we `transfers` their share from the platform ledger to
 * their connected-account ledger. This keeps the connected-account model for
 * identity + payouts while using a catalog path that actually works.
 *
 * `initial_price` is decimal in the plan currency (Whop: "10.43 for $10.43"),
 * so we convert from our integer cents.
 */
export async function createWhopCatalogEntry(params: {
  sellerCompanyId: string; // connected account — recorded for payout routing
  title: string;
  description?: string | null;
  priceCents: number;
  listingId: string;
}): Promise<{ productId: string; planId: string }> {
  const product = await whop.products.create({
    company_id: WHOP_PLATFORM_COMPANY_ID,
    title: params.title.slice(0, 80), // Whop caps product title at 80 chars
    description: params.description ?? undefined,
    visibility: "visible",
    metadata: { listing_id: params.listingId, seller_company_id: params.sellerCompanyId },
  });

  const plan = await whop.plans.create({
    company_id: WHOP_PLATFORM_COMPANY_ID,
    product_id: product.id,
    plan_type: "one_time",
    release_method: "buy_now",
    currency: "usd",
    initial_price: params.priceCents / 100,
    metadata: { listing_id: params.listingId, seller_company_id: params.sellerCompanyId },
  });

  return { productId: product.id, planId: plan.id };
}
