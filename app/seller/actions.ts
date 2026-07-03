"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { whop, Whop, WHOP_PLATFORM_COMPANY_ID, APP_URL } from "@/lib/whop";
import { createOnboardingLink } from "@/lib/sellers";

const back = (msg: string) => `/seller?error=${encodeURIComponent(msg)}`;
const info = (msg: string) => `/seller?info=${encodeURIComponent(msg)}`;

/**
 * Seller onboarding orchestrator (Chunk 2):
 *   1. ensure a `sellers` row (dedupe-first — guards against duplicate Whop companies)
 *   2. create the connected account (real path; 403 → Platforms-access fallback)
 *   3. mint a hosted KYC link and send the seller to Whop
 *
 * Note: every `whop.*` call is wrapped so we can `redirect()` OUTSIDE the try/catch
 * (redirect throws internally and would otherwise be swallowed).
 */
export async function startSellerOnboarding(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  const email = user!.email!;

  // 1. ensure seller row
  let { data: seller } = await supabase
    .from("sellers")
    .select("*")
    .eq("supabase_user_id", user!.id)
    .maybeSingle();

  if (!seller) {
    const { data: created, error } = await supabase
      .from("sellers")
      .insert({ supabase_user_id: user!.id, email })
      .select()
      .single();
    if (error) redirect(back(error.message));
    seller = created;
  }

  // 2. create the connected account if we don't already have one
  let companyId = seller!.whop_company_id;
  if (!companyId) {
    let created: string | null = null;
    let errMsg: string | null = null;
    try {
      const company = await whop.companies.create({
        title: title || `${email}'s storefront`,
        parent_company_id: WHOP_PLATFORM_COMPANY_ID,
        email,
        send_customer_emails: false,
        metadata: { creatorjobs_seller_id: seller!.id },
      });
      created = company.id;
    } catch (e) {
      if (e instanceof Whop.APIError && e.status === 403) {
        errMsg =
          "Connected accounts need Platforms access (403). In an env without it, we'd fall back to a platform-managed seller.";
      } else if (e instanceof Whop.APIError) {
        errMsg = `(${e.status}) ${e.message}`;
      } else {
        errMsg = "Failed to create connected account.";
      }
    }
    if (errMsg) redirect(back(errMsg));
    await supabase.from("sellers").update({ whop_company_id: created }).eq("id", seller!.id);
    companyId = created;
  }

  // 3. mint the hosted KYC link. Whop requires https return/refresh URLs, so on a
  //    local http:// host we skip the redirect (the connected account is already
  //    created) — hosted KYC runs on the deployed https URL. Readiness is re-checked
  //    against Whop's ledger regardless (never inferred from the redirect).
  if (!APP_URL.startsWith("https://")) {
    redirect(
      info(
        "Connected account created ✅. Hosted KYC needs an https URL, so it runs on the deployed (Vercel) build — not local http. Payout readiness is re-checked against Whop automatically.",
      ),
    );
  }

  let url: string | null = null;
  let linkErr: string | null = null;
  try {
    url = await createOnboardingLink(companyId!);
  } catch (e) {
    linkErr = e instanceof Whop.APIError ? `(${e.status}) ${e.message}` : "Failed to create onboarding link.";
  }
  if (linkErr) redirect(back(linkErr));
  if (!url) redirect(back("Whop returned no onboarding URL (KYC may be unavailable in sandbox)."));
  redirect(url);
}
