import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createOnboardingLink } from "@/lib/sellers";
import { APP_URL } from "@/lib/whop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * KYC refresh URL. Whop sends the seller here when the hosted session expired and
 * needs re-authentication. We mint a fresh onboarding link and bounce them back in;
 * if anything fails, fall back to the dashboard with a message.
 */
export async function GET(_request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${APP_URL}/login`);

  const { data: seller } = await supabase
    .from("sellers")
    .select("whop_company_id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (seller?.whop_company_id) {
    try {
      const url = await createOnboardingLink(seller.whop_company_id);
      if (url) return NextResponse.redirect(url);
    } catch {
      /* fall through */
    }
  }
  return NextResponse.redirect(
    `${APP_URL}/seller?error=${encodeURIComponent("Onboarding session expired — please start again.")}`,
  );
}
