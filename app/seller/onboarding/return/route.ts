import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeReadiness } from "@/lib/sellers";
import { APP_URL } from "@/lib/whop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * KYC return URL. The seller "came back" — but that is NOT proof KYC passed, so we
 * re-check readiness against Whop (ledger approval + payout-account status) and
 * persist the real state before showing the dashboard.
 */
export async function GET(_request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${APP_URL}/login`);

  const { data: seller } = await supabase
    .from("sellers")
    .select("*")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (seller?.whop_company_id) {
    const r = await computeReadiness(seller.whop_company_id);
    await supabase
      .from("sellers")
      .update({ kyc_status: r.kyc, payout_ready: r.payoutReady })
      .eq("id", seller.id);
  }

  return NextResponse.redirect(`${APP_URL}/seller`);
}
