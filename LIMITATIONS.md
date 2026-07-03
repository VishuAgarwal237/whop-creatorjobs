# Sandbox limitations, mocks & adaptations

Per the brief, this was built **directly against the Whop sandbox**. Below is everything the
sandbox couldn't do, what we mocked, and what we adapted — with what changes for production.
All findings were verified empirically against `sandbox-api.whop.com`.

## Hard sandbox limitations (documented by Whop) + how we handled them

| # | Limitation | What we did | Production change |
|---|---|---|---|
| 1 | **Payouts are disabled in the sandbox.** Verified: `transfers.create` → `400 "Sends are only supported from an Ethereum wallet"`. | Payout release is **stubbed** behind `PAYOUTS_ENABLED=false` — the payout row is created + gated (reserve window, dispute-freeze, idempotency) exactly as in prod, but marked `status: stubbed` instead of moving money. | Set `PAYOUTS_ENABLED=true`; the same code path calls `whop.transfers.create` (platform → seller ledger, `idempotence_key = payment id`). |
| 2 | **KYC never truly completes in sandbox** — there's no real underwriting, so a connected account's ledger `payments_approval_status` stays `null`/`pending` and no payout account reaches `connected`. | `payout_ready` correctly stays **false**; we surface it as "expected in sandbox" (this is literally take-home Scenario 2). Readiness is always re-read from the Whop ledger, never assumed. | Real KYC via the hosted portal flips approval → `payout_ready` becomes true. |
| 3 | **Apps & messaging disabled in sandbox.** | Built as a **standalone Next.js app with Supabase Auth**, not a Whop iframe app; we do **not** use the Whop app-user token (`x-whop-user-token`). | Optionally run as a Whop App / "Sign in with Whop" (OAuth) in prod. |
| 4 | **Only card payments in sandbox** (no Apple/Google Pay, alt methods). | Checkout demoed with test card `4242 4242 4242 4242`. | No change — Whop enables the other methods automatically in prod. |

## Whop API behaviors we had to adapt around (verified in sandbox)

| # | Finding | Adaptation |
|---|---|---|
| 5 | **`plans.create` returns 404 for a connected account** created under the platform key (while `products.create` works, and `plans.create` on the platform's own company works). Standalone plan creation only works on the company the key owns. | **Catalog (product + plan) is created under the PLATFORM company**, tagged with `metadata.seller_company_id`. The seller's connected account remains the **payout destination** — their share is `transfers`'d to their ledger at settlement. Still a connected-accounts model, just a catalog path that works. |
| 6 | **`account-links` (hosted KYC/payout portal) requires `https` return/refresh URLs** — `http://localhost` → `400 "Refresh URL must start with 'https://'"`. | On local `http` we **skip the redirect** (the connected account is still created) and show a note; hosted KYC runs on the deployed `https` build. Readiness is re-checked against the ledger regardless. |
| 7 | **Connected-account `email` must have valid MX records** — `example.com` → `400 "does not accept incoming mail"`. | Require an MX-valid email (we use gmail addresses in the demo). |
| 8 | **The originally-provided API key was a *production* key** — `401` on `sandbox-api.whop.com`, `200` on `api.whop.com`. (This is take-home Scenario 3, live.) | Switched to a real sandbox key; `/api/health` diagnoses 401 (env/auth) vs 403 (scope). |
| 9 | **`plan.initial_price` is decimal dollars** (e.g. `10.43`), not minor units — undocumented; confirmed by testing. | Convert our integer cents → dollars when creating plans. |

## What is mocked in this build (and only this)

- **Payout transfers** → stubbed `payouts` rows (item 1). Everything up to the transfer (intent, reserve hold, dispute freeze, idempotency, ledger balance read) is real.
- **Webhook *delivery*** → Whop can't deliver to `localhost`, so the handler was verified with **self-signed Standard-Webhooks payloads** (correct HMAC/secret) + the reconciliation cron. In prod you register the sandbox webhook to the deployed `/api/webhooks/whop` URL — the handler code is unchanged.
- Nothing else is mocked: connected-account creation, hosted KYC link creation, products/plans, checkout sessions, the embedded checkout, payment retrieval, and ledger reads are all **real sandbox API calls**.

## Experimental (Beta) vs Stable API — where we had to use Stable

The brief asked us to prefer the **Experimental (Beta)** API and **flag anywhere we fell back to Stable**. There is **no separate base URL** — the `@whop/sdk` client is pinned to a dated version via the `Api-Version-Date` header, so we get the latest (experimental) request/response shapes on every call. The Beta/Stable split is which resources have a Beta entry in Whop's docs. Per-endpoint:

| Endpoint / SDK call | Used for | API surface |
|---|---|---|
| `companies.create` | seller connected account | **Beta** ✅ |
| `account-links.create` | hosted KYC / payout portal | **Beta** ✅ |
| `products.create` | listing → product | **Beta** ✅ |
| `plans.create` | listing → one-time plan | **Beta** ✅ |
| `checkout-configurations.create` | buyer checkout session | **Beta** ✅ |
| `ledger-accounts.retrieve` | payout readiness + balance | **Beta** ✅ |
| `transfers.create` | seller payout (prod) | **Beta** ✅ |
| `accounts.me` | auth/env health check | **Beta** ✅ |
| **`payments.retrieve` / `payments.list`** | payment confirmation + reconciliation | **Stable** ⚠️ — no Beta variant of the Payment retrieve/list endpoint is documented, so this is a Stable fallback |
| **`webhooks.unwrap` + webhook registration** | verifying/receiving Whop webhooks | **Stable** ⚠️ — webhooks are documented under the Stable reference only |
| **memberships** (object read via payment/webhook `membership`) | order fulfillment signal | **Stable** ⚠️ — no Beta memberships resource |

**Summary of Stable fallbacks (unavoidable):** payment **retrieve/list**, **webhooks**, and **memberships**. These are core to payment confirmation and order state, so the take-home's "webhook = signal, API = truth" path necessarily touches the Stable API. Everything on the commerce + money-movement path (companies, catalog, checkout, ledgers, transfers, account-links) is on **Beta**, pinned via `Api-Version-Date`.

## Open questions to confirm with Whop (genuinely undocumented)

1. **Clawback / negative-balance policy** after a refund or lost dispute once a seller has been paid out. We mitigate with a reserve/hold window + dispute-freeze, but the authoritative behavior isn't documented.
2. **`application_fee_amount` units + fee/dispute liability** on connected-account checkouts.
3. **Min/max transfer & withdrawal amounts** and insufficient-balance behavior.

## Deploying this sandbox build

Sandbox config stays as-is (`WHOP_BASE_URL=sandbox`, `PAYOUTS_ENABLED=false`); a public link only additionally needs a cloud Supabase (Vercel can't reach local Supabase). See [DEPLOY.md](./DEPLOY.md).
