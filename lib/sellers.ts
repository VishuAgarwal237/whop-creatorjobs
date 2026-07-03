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
