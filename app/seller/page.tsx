import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeReadiness, getPayoutDetail } from "@/lib/sellers";
import { Container, Card, PageHeader, StatusBadge, Notice, Field, btn, inputCls } from "@/components/ui";
import { startSellerOnboarding } from "./actions";

export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function StepRow({ done, pending, title, detail }: { done: boolean; pending?: boolean; title: string; detail?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
        style={{ background: done ? "var(--success)" : pending ? "var(--warning)" : "#d1d5db" }}
      >
        {done ? "✓" : pending ? "•" : ""}
      </span>
      <div>
        <div className="text-sm font-medium">{title}</div>
        {detail ? <div className="text-xs text-muted">{detail}</div> : null}
      </div>
    </div>
  );
}

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
  if (!user) redirect("/login?next=/seller");

  const { data: seller } = await supabase
    .from("sellers")
    .select("*")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  const hasCompany = Boolean(seller?.whop_company_id);
  const kyc = seller?.kyc_status ?? "pending";
  const payoutReady = seller?.payout_ready ?? false;

  const { data: payouts } = seller
    ? await supabase.from("payouts").select("id, amount_cents, status, created_at").order("created_at", { ascending: false })
    : { data: [] };
  const withdrawable = seller?.whop_company_id ? (await computeReadiness(seller.whop_company_id)).withdrawable : null;
  const payoutDetail = seller?.whop_company_id ? await getPayoutDetail(seller.whop_company_id) : null;

  return (
    <Container>
      <PageHeader
        title="Seller dashboard"
        subtitle={user.email ?? undefined}
        action={
          <Link href="/seller/listings" className={btn("outline")}>
            My listings
          </Link>
        }
      />

      <div className="flex flex-col gap-4">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {info ? <Notice kind="info">{info}</Notice> : null}

        {/* Onboarding */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Onboarding</h2>
            {payoutReady ? <StatusBadge status="approved" label="payout ready" /> : <StatusBadge status="pending" label="in progress" />}
          </div>
          <div className="mt-2 divide-y divide-border">
            <StepRow done={hasCompany} title="Connected account" detail={hasCompany ? seller!.whop_company_id! : "Not created yet"} />
            <StepRow
              done={kyc === "approved"}
              pending={kyc === "pending"}
              title="Identity verification (KYC)"
              detail={kyc === "approved" ? "Approved" : kyc === "rejected" ? "Rejected" : "Pending on Whop"}
            />
            <StepRow
              done={payoutReady}
              pending={!payoutReady}
              title="Payout ready"
              detail={payoutReady ? "Ready to receive payouts" : "Sandbox disables payouts — expected to stay pending (Scenario 2)"}
            />
          </div>

          <form action={startSellerOnboarding} className="mt-4 flex flex-col gap-3">
            {!hasCompany ? (
              <Field label="Storefront name">
                <input name="title" placeholder="e.g. Jane's Design Studio" className={inputCls} />
              </Field>
            ) : null}
            <button className={btn("dark", "self-start")}>
              {hasCompany ? "Open Whop onboarding again" : "Create connected account & start KYC"}
            </button>
          </form>
          <p className="mt-2 text-xs text-muted">
            Returning from Whop&apos;s hosted KYC doesn&apos;t itself mean you passed — we re-check
            readiness against Whop&apos;s ledger.
          </p>
        </Card>

        {/* Payout setup (Scenario 2) */}
        {hasCompany ? (
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Payout setup</h2>
              <StatusBadge
                status={payoutDetail?.accountStatus ?? "not_started"}
                label={(payoutDetail?.accountStatus ?? "not started").replace(/_/g, " ")}
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              Live from Whop&apos;s payout account (KYC + withdrawal readiness).
            </p>
            <ul className="mt-3 divide-y divide-border">
              {(payoutDetail?.methods ?? []).length === 0 ? (
                <li className="py-2.5 text-sm text-muted">
                  No payout method connected yet — expected in sandbox, where payouts are disabled.
                </li>
              ) : (
                payoutDetail!.methods.map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-medium">
                      {m.label}
                      {m.isDefault ? <span className="ml-2 text-xs text-muted">(default)</span> : null}
                    </span>
                    <span className="text-xs uppercase text-muted">{m.currency}</span>
                  </li>
                ))
              )}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Payout-ready needs <span className="font-medium">payments approved</span> AND a{" "}
              <span className="font-medium">connected</span> payout account. A sandbox seller stays
              not-ready by design (Scenario 2) — that&apos;s not a bug.
            </p>
          </Card>
        ) : null}

        {/* Earnings */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Earnings</h2>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted">Withdrawable (Whop ledger)</div>
              <div className="text-lg font-bold">{withdrawable != null ? usd(withdrawable) : "—"}</div>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {(payouts ?? []).length === 0 ? (
              <li className="py-2 text-sm text-muted">No payouts yet — sell something!</li>
            ) : (
              payouts!.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium">{usd(p.amount_cents)}</span>
                  <StatusBadge status={p.status} label={p.status === "stubbed" ? "released (sandbox)" : undefined} />
                </li>
              ))
            )}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Payouts are held for a reserve window, then released (real transfers in production;
            simulated in sandbox). Frozen automatically on dispute/refund.
          </p>
        </Card>
      </div>
    </Container>
  );
}
