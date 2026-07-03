# CreatorJobs — Written scenario answers

CSM debugging playbook. For each: **Issue type · Customer reply · Internal action · Urgency · Evidence · Escalate?** Answers reference this prototype's actual tooling (`/api/health`, `/admin`, the reconciliation cron, and Whop's API).

---

## Scenario 1 — "A buyer paid, but our marketplace still says the order is pending. Is Whop broken?"

- **Issue type:** Expected behavior / state-sync — almost never a Whop outage.
- **Customer reply:** "Whop isn't broken. A payment sits in `pending` when it's authorized but not yet settled, and we intentionally keep the order in `PROCESSING` until we receive the verified `payment.succeeded` webhook (or read `status: paid` from the API). It flips automatically; if a webhook was missed, our reconciliation sweep re-reads the payment from Whop and heals the order within a minute."
- **Internal action:**
  1. In `/admin`, find the order — it shows our status next to the **live `GET /payments/{id}`** status/substatus and a ⚠️ mismatch flag.
  2. If Whop says `paid` but we're not: check the **Webhook delivery** panel for the `payment.succeeded` event (verified? processed? error?).
  3. Click **re-check** on the order (re-derives from Whop truth) or **Run reconciliation**.
- **Urgency:** Low–Medium (self-healing; escalate only if money is truly stuck).
- **Evidence:** payment id, Whop `status`/`substatus`, our `orders.status` + `updated_at`, the `webhook_events` row (verified/processed/error).
- **Escalate to engineering?** Only if `GET /payments` returns `paid` but **no** `payment.succeeded` webhook ever arrived (a Whop delivery issue) — attach the payment id + delivery log.

---

## Scenario 2 — "The seller completed onboarding, but they still can't withdraw. This is blocking launch."

- **Issue type:** Payout readiness / KYC gap — "finished the form" ≠ "payout-eligible."
- **Customer reply:** "Completing the onboarding UI isn't the same as being payout-ready. Withdrawals require the ledger's `payments_approval_status = approved` **and** a connected payout account (`status = connected`), with funds `available` (not `pending`/`reserved`). Also note: **payouts are disabled in the Whop sandbox**, so a sandbox seller will correctly stay `payout_ready = false` — that's expected, not a bug."
- **Internal action:**
  1. `GET /ledger_accounts/{biz}` → check `payments_approval_status` and `payout_account_details.status`; check `treasury_balance` (available vs pending vs reserve).
  2. Confirm a payout method exists; if KYC is incomplete, re-issue an `account-links` (`payouts_portal`) link.
  3. Confirm environment — sandbox can't produce a payout-ready seller; validate in production.
- **Urgency:** High (blocks launch/GTM).
- **Evidence:** ledger `approval_status`, payout-account status, balance breakdown, KYC/`payout_account.status_updated` events.
- **Escalate to engineering?** Escalate to Whop if, in **production**, KYC is `approved` + payout account `connected` + funds `available` but a withdrawal still fails.

---

## Scenario 3 — "We created a connected seller, but all API calls return 401."

- **Issue type:** Authentication / environment mismatch — **not** a permissions problem.
- **Customer reply:** "Per Whop's error taxonomy a **401 is authentication**, not authorization. The #1 cause is an **environment mismatch**: a **sandbox key hitting the production base URL (or vice-versa)**, or a missing/invalid/mistyped key, or a missing `Bearer` prefix. If the key were valid but under-scoped you'd get a **403**, not a 401 — so the status code tells us where to look."
- **Internal action:**
  1. Hit our **`GET /api/health`** — it calls `accounts.me()` and, on failure, prints whether it's 401 (auth/env) or 403 (scope) with a hint. (We verified this live: the same key returns 401 on `sandbox-api.whop.com` and 200 on `api.whop.com`.)
  2. Confirm `WHOP_BASE_URL` matches the key's environment; confirm `Authorization: Bearer <key>` server-side.
  3. If it's actually a 403, check the key's scopes for the operation. Regenerate if revoked.
  *(Note: whether connected-account calls use the parent key + `company_id` vs the account's own key isn't clearly documented — verify empirically and record.)*
- **Urgency:** High (blocks all API usage).
- **Evidence:** exact status (401 vs 403), redacted failing request, key environment, API base URL, endpoint.
- **Escalate to engineering?** Only if a correct-environment key with `Bearer` and the right scope still 401s.

---

## Scenario 4 — "We need one dashboard: buyer payment, order state, seller payout status, webhook delivery, and errors. Without this our ops team is blind."

- **Issue type:** Observability — solved product-side.
- **Customer reply:** "That's exactly the `/admin` ops dashboard we built. One screen shows: **orders** with our status vs **live Whop payment** status (+ mismatch flags and a per-order re-check), **payout** status (transfer id / hold / freeze reason), and **webhook delivery** (signature verified, processed, and any error), plus KPI counters and a **Run reconciliation** button."
- **Internal action:** ship `/admin` (service-role, `ADMIN_EMAILS`-gated) backed by `webhook_events` + live Whop reads (`payments`, `ledger_accounts`); the reconcile button runs the same idempotent sweep as the cron.
- **Urgency:** Medium (unblocks ops; not a live money incident).
- **Evidence:** the dashboard itself + the reconciliation queue/counters.
- **Escalate to engineering?** No — build-side; extend with alerting (e.g. Slack on webhook errors) as a follow-up.
