import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Container, Card, PageHeader, StatusBadge, Notice, Field, btn, inputCls } from "@/components/ui";
import { createListing, updateListing } from "./actions";
import { DeleteListingButton } from "./DeleteListingButton";

export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function SellerListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; deleted?: string; archived?: string; updated?: string }>;
}) {
  const { error, created, deleted, archived, updated } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/seller/listings");

  const { data: seller } = await supabase
    .from("sellers")
    .select("id, whop_company_id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  const { data: listings } = seller
    ? await supabase
        .from("listings")
        .select("id, title, description, price_cents, status, whop_plan_id, created_at, seller_id")
        .eq("seller_id", seller.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <Container>
      <PageHeader
        title="My listings"
        subtitle="Each listing becomes a Whop product + plan."
        action={
          <Link href="/seller" className={btn("outline")}>
            ← Dashboard
          </Link>
        }
      />

      <div className="flex flex-col gap-4">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {created ? <Notice kind="success">Listing created and mirrored to Whop ✅</Notice> : null}
        {updated ? <Notice kind="success">Listing updated ✅</Notice> : null}
        {deleted ? <Notice kind="success">Listing deleted ✅</Notice> : null}
        {archived ? (
          <Notice kind="info">
            Listing has orders, so it was archived (removed from the marketplace) instead of deleted — order history is kept.
          </Notice>
        ) : null}

        {!seller?.whop_company_id ? (
          <Notice kind="info">
            You need a connected account first — head to the{" "}
            <Link href="/seller" className="underline">
              seller dashboard
            </Link>{" "}
            to onboard.
          </Notice>
        ) : (
          <Card>
            <h2 className="font-semibold">New listing</h2>
            <form action={createListing} className="mt-3 flex flex-col gap-3">
              <Field label="Title">
                <input name="title" placeholder="Logo design, landing page, etc." className={inputCls} />
              </Field>
              <Field label="Description">
                <textarea name="description" rows={3} placeholder="What the buyer gets…" className={inputCls} />
              </Field>
              <Field label="Price (USD)">
                <input name="price" type="number" step="0.01" min="0.5" placeholder="25.00" className={`${inputCls} max-w-40`} />
              </Field>
              <button className={btn("dark", "self-start")}>Create listing</button>
            </form>
          </Card>
        )}

        <Card>
          <h2 className="font-semibold">Existing listings</h2>
          {(listings ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted">No listings yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {listings!.map((l) => (
                <li key={l.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Link href={`/listing/${l.id}`} className="font-medium hover:text-[var(--whop-blue)] hover:underline">
                        {l.title}
                      </Link>
                      <div className="text-sm text-muted">
                        {usd(l.price_cents)} · {l.whop_plan_id ? "Whop plan ✓" : "no plan"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={l.status} />
                      <DeleteListingButton listingId={l.id} title={l.title} />
                    </div>
                  </div>

                  <details className="mt-2 group">
                    <summary className="cursor-pointer select-none text-xs font-semibold text-[var(--whop-blue)] hover:underline">
                      Edit
                    </summary>
                    <form action={updateListing} className="mt-3 grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-2">
                      <input type="hidden" name="listing_id" value={l.id} />
                      <div className="sm:col-span-2">
                        <Field label="Title">
                          <input name="title" defaultValue={l.title} className={inputCls} />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field label="Description">
                          <textarea name="description" rows={2} defaultValue={l.description ?? ""} className={inputCls} />
                        </Field>
                      </div>
                      <Field label="Price (USD)">
                        <input
                          name="price"
                          type="number"
                          step="0.01"
                          min="0.5"
                          defaultValue={(l.price_cents / 100).toFixed(2)}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Status">
                        <select name="status" defaultValue={l.status} className={inputCls}>
                          <option value="active">active (on marketplace)</option>
                          <option value="archived">archived (hidden)</option>
                        </select>
                      </Field>
                      <div className="sm:col-span-2">
                        <button className={btn("dark", "self-start")}>Save changes</button>
                      </div>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Container>
  );
}
