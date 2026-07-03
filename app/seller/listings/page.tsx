import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Container, Card, PageHeader, StatusBadge, Notice, Field, btn, inputCls } from "@/components/ui";
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
  if (!user) redirect("/login?next=/seller/listings");

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
                <li key={l.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link href={`/listing/${l.id}`} className="font-medium hover:text-[var(--whop-blue)] hover:underline">
                      {l.title}
                    </Link>
                    <div className="text-sm text-muted">
                      {usd(l.price_cents)} · {l.whop_plan_id ? "Whop plan ✓" : "no plan"}
                    </div>
                  </div>
                  <StatusBadge status={l.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Container>
  );
}
