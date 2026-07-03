import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { startSellerOnboarding } from "./actions";
import { computeReadiness } from "@/lib/sellers";

export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function SellerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; info?: string }>;
}) {
  const { error, info } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: seller } = await supabase
    .from("sellers")
    .select("*")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  const hasCompany = Boolean(seller?.whop_company_id);
  const kyc = seller?.kyc_status ?? "pending";
  const payoutReady = seller?.payout_ready ?? false;

  // Earnings: our payout ledger (RLS: seller reads own) + live Whop balance.
  const { data: payouts } = seller
    ? await supabase
        .from("payouts")
        .select("id, amount_cents, status, created_at")
        .order("created_at", { ascending: false })
    : { data: [] };
  const withdrawable = seller?.whop_company_id
    ? (await computeReadiness(seller.whop_company_id)).withdrawable
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Seller dashboard</h1>
        <div className="flex items-center gap-4">
          <Link href="/seller/listings" className="text-sm text-blue-600 underline">
            My listings
          </Link>
          <form action={signOut}>
            <button className="text-sm text-gray-500 underline">Sign out</button>
          </form>
        </div>
      </header>
      <p className="text-sm text-gray-500">Signed in as {user.email}</p>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {info ? (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">{info}</p>
      ) : null}

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">Onboarding status</h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>Connected account: {hasCompany ? `✅ ${seller!.whop_company_id}` : "⛔ not created"}</li>
          <li>KYC / approval: {kyc === "approved" ? "✅ approved" : kyc === "rejected" ? "❌ rejected" : "⏳ pending"}</li>
          <li>
            Payout ready: {payoutReady ? "✅ yes" : "⏳ no"}
            {hasCompany && !payoutReady ? (
              <span className="text-gray-400">
                {" "}
                — expected in sandbox (payouts disabled). This is Scenario 2.
              </span>
            ) : null}
          </li>
        </ul>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">{hasCompany ? "Continue / re-check onboarding" : "Start onboarding"}</h2>
        <form action={startSellerOnboarding} className="mt-3 flex flex-col gap-3">
          {!hasCompany ? (
            <label className="flex flex-col gap-1 text-sm">
              Storefront name
              <input
                name="title"
                placeholder="e.g. Jane's Design Studio"
                className="rounded-md border px-3 py-2"
              />
            </label>
          ) : null}
          <button className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
            {hasCompany ? "Open Whop onboarding again" : "Create connected account & start KYC"}
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          You&apos;ll be redirected to Whop&apos;s hosted KYC. Returning here does not by
          itself mean KYC passed — we re-check readiness against Whop on return.
        </p>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">Earnings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Withdrawable balance (Whop ledger):{" "}
          <strong>{withdrawable != null ? usd(withdrawable) : "—"}</strong>
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {(payouts ?? []).length === 0 ? (
            <li className="text-gray-500">No payouts yet — sell something!</li>
          ) : (
            payouts!.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{usd(p.amount_cents)}</span>
                <span className="text-gray-500">
                  {p.status === "stubbed" ? "released (sandbox stub)" : p.status}
                </span>
              </li>
            ))
          )}
        </ul>
        <p className="mt-2 text-xs text-gray-400">
          Payouts are held for a reserve window, then released (real transfers in
          production; simulated in sandbox). Frozen automatically on dispute/refund.
        </p>
      </section>
    </main>
  );
}
