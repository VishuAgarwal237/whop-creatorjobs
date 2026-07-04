import "server-only";
import { whop, APP_URL } from "@/lib/whop";
import type { KycStatus } from "@/lib/database.types";

/**
 * Re-check a seller's payout readiness from Whop (source of truth). Called on the
 * KYC return and on the `payout_account.status_updated` webhook — NEVER inferred
 * from the fact that the browser hit our return_url (that only means "came back").
 *
 * Readiness requires BOTH: payments approved AND a connected payout account.
 * In the sandbox payouts are disabled, so this typically stays `pending` — which
 * is exactly the real-world Scenario 2 ("onboarded but can't withdraw").
 */
export async function computeReadiness(companyId: string): Promise<{
  kyc: KycStatus;
  payoutReady: boolean;
  withdrawable: number | null;
}> {
  try {
    const ledger = await whop.ledgerAccounts.retrieve(companyId);
    const approval = ledger.payments_approval_status; // 'pending'|'approved'|'monitoring'|'rejected'|null
    const payoutStatus = String(ledger.payout_account_details?.status ?? "");
    const withdrawable = ledger.treasury_balance?.total_withdrawable_balance ?? null;

    const kyc: KycStatus =
      approval === "approved" ? "approved" : approval === "rejected" ? "rejected" : "pending";
    const payoutReady = approval === "approved" && payoutStatus === "connected";
    return { kyc, payoutReady, withdrawable };
  } catch {
    // Sandbox often has no ledger/payout data for a fresh connected account.
    return { kyc: "pending", payoutReady: false, withdrawable: null };
  }
}

/**
 * Fetch the seller's payout setup from Whop for the /seller "Payout setup" panel
 * (Scenario 2 — "onboarded but can't withdraw"). Best-effort: a fresh sandbox
 * connected account often has no payout account/methods yet, which is exactly the
 * state we want to surface rather than hide.
 */
export type PayoutMethodView = { id: string; label: string; isDefault: boolean; currency: string };
export async function getPayoutDetail(companyId: string): Promise<{
  accountStatus: string | null;
  methods: PayoutMethodView[];
}> {
  let accountStatus: string | null = null;
  let methods: PayoutMethodView[] = [];

  try {
    const acct = await whop.payoutAccounts.retrieve(companyId);
    accountStatus = acct.status ?? null;
  } catch {
    // no payout account yet (expected for a fresh sandbox seller)
  }

  try {
    const page = await whop.payoutMethods.list({ company_id: companyId });
    methods = (page.data ?? []).map((m) => ({
      id: m.id,
      label: m.institution_name ?? m.nickname ?? m.account_reference ?? "Payout method",
      isDefault: m.is_default,
      currency: m.currency,
    }));
  } catch {
    // no methods yet
  }

  return { accountStatus, methods };
}

/** Create a fresh hosted KYC/onboarding link for a connected account. */
export async function createOnboardingLink(companyId: string): Promise<string | null> {
  const link = await whop.accountLinks.create({
    company_id: companyId,
    use_case: "account_onboarding",
    return_url: `${APP_URL}/seller/onboarding/return`,
    refresh_url: `${APP_URL}/seller/onboarding/refresh`,
  });
  return (link as { url?: string }).url ?? null;
}
