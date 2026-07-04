# Sandbox limitations, mocks & adaptations

Per the brief, this was built **directly against the Whop sandbox**. Below is everything the
sandbox couldn't do, what we mocked, and what we adapted — with what changes for production.
Every finding below was **verified empirically** against `sandbox-api.whop.com`.

## Limitations & adaptations

One table: the limitation/finding, what we did about it, and what changes in production.
(Rows 1–4 are documented sandbox limitations; rows 5–9 are Whop API behaviors we hit.)

| # | Limitation / finding (verified) | What we did | Production change |
|---|---|---|---|
| 1 | **Payouts are disabled in the sandbox** — `transfers.create` → `400 "Sends are only supported from an Ethereum wallet"`. | Payout release is **stubbed** behind `PAYOUTS_ENABLED=false`; the payout row is still created + gated (reserve window, dispute-freeze, idempotency) exactly as in prod, but marked `status: stubbed` instead of moving money. | Set `PAYOUTS_ENABLED=true`; the same code path calls `whop.transfers.create` (platform → seller ledger, `idempotence_key = payment id`). |
| 2 | **KYC never truly completes in sandbox** — a connected account's ledger `payments_approval_status` stays `null`/`pending` and no payout account reaches `connected`. | `payout_ready` correctly stays **false**; surfaced as "expected in sandbox" (take-home Scenario 2). Readiness is always re-read from the Whop ledger, never assumed. | Real KYC via the hosted portal flips approval → `payout_ready` becomes true. |
| 3 | **Apps & messaging disabled in sandbox.** | Built as a **standalone Next.js app with Supabase Auth**; we do **not** use the Whop app-user token (`x-whop-user-token`). | Optionally run as a Whop App / "Sign in with Whop" (OAuth). |
| 4 | **Only card payments in sandbox** (no Apple/Google Pay, alt methods). | Demoed with test card `4242 4242 4242 4242`. | None — Whop enables the other methods automatically. |
| 5 | **`plans.create` returns 404 for a connected account** (while `products.create` works, and `plans.create` on the platform's own company works) — standalone plan creation only works on the company the key owns. | **Catalog (product + plan) created under the PLATFORM company**, tagged `metadata.seller_company_id`; the connected account stays the **payout destination** (share `transfers`'d to its ledger at settlement). | None — same path works in prod. |
| 6 | **`account-links` requires `https` return/refresh URLs** — `http://localhost` → `400 "Refresh URL must start with 'https://'"`. | On local `http` we **skip the redirect** (the connected account is still created) and show a note. | Hosted KYC runs on the deployed `https` build; readiness re-checked from the ledger. |
| 7 | **Connected-account `email` must have valid MX records** — `example.com` → `400 "does not accept incoming mail"`. | Require an MX-valid email (gmail in the demo). | None. |
| 8 | **The originally-provided API key was a *production* key** — `401` on sandbox, `200` on prod (take-home Scenario 3, live). | Switched to a real sandbox key; `/api/health` diagnoses 401 (env/auth) vs 403 (scope). | Use the prod key **with** `WHOP_BASE_URL=…/api.whop.com`. |
| 9 | **`plan.initial_price` is decimal dollars** (e.g. `10.43`), not minor units — undocumented; confirmed by testing. | Convert our integer cents → dollars when creating plans. | None. |

## What is mocked (and only this)

- **Payout transfers** → stubbed `payouts` rows (row 1). Everything up to the transfer (intent, reserve hold, dispute freeze, idempotency, ledger balance read) is real.
- **Webhook *delivery*** → Whop can't deliver to `localhost`, so the handler was verified with **self-signed Standard-Webhooks payloads** (correct HMAC/secret) + the reconciliation cron. In prod you register the sandbox webhook to the deployed `/api/webhooks/whop` URL — the handler code is unchanged.
- Nothing else is mocked: connected-account creation, hosted KYC link creation, products/plans, checkout sessions, the embedded checkout, payment retrieval, and ledger reads are all **real sandbox API calls**.

## Experimental (Beta) vs Stable API — where we used Stable

The brief asked us to prefer the **Experimental (Beta)** API and flag Stable fallbacks. Mechanism: there is **no separate base URL** — the `@whop/sdk` client is pinned via the `Api-Version-Date` header, so every call gets the latest (experimental) request/response shapes. Whop's "Beta/Stable" split is a **docs-navigation distinction** (which resources have a `/api-reference/beta/` entry). Per specific API call we make:

| SDK call | REST endpoint | Used for | Surface |
|---|---|---|---|
| `accounts.me()` | `GET /accounts/me` | auth / env health check | **Beta** ✅ |
| `products.create()` | `POST /products` | listing → product | **Beta** ✅ |
| `plans.create()` | `POST /plans` | listing → one-time plan | **Beta** ✅ |
| `checkoutConfigurations.create()` | `POST /checkout-configurations` | buyer checkout session | **Beta** ✅ |
| `ledgerAccounts.retrieve()` | `GET /ledger_accounts/{id}` | payout readiness + balance | **Beta** ✅ |
| `transfers.create()` | `POST /transfers` | seller payout (prod) | **Beta** ✅ |
| `companies.create()` | `POST /companies` | seller connected account | **Stable** ⚠️ (standard reference, no Beta entry) |
| `accountLinks.create()` | `POST /account-links` | hosted KYC / payout portal | **Stable** ⚠️ (standard reference, no Beta entry) |
| `payments.retrieve()` | `GET /payments/{id}` | payment confirmation (webhook = signal, API = truth) | **Stable** ⚠️ (no Beta variant) |
| `payments.list()` | `GET /payments` | reconciliation (find payment by checkout config) | **Stable** ⚠️ (no Beta variant) |
| `webhooks.unwrap()` | (Standard Webhooks verify) | verify + receive Whop webhooks | **Stable** ⚠️ (documented under standard reference) |

Notes:
- We do **not** call a memberships endpoint — we only read the `membership` field embedded on the Payment/webhook object.
- The unavoidable Stable touchpoints are **`payments.retrieve`/`payments.list`** and **`webhooks.unwrap`** — they sit on the "webhook = signal, API = truth" confirmation path, which has no Beta equivalent. `companies.create` and `account-links.create` are also Stable (Whop documents them only under the standard reference).

## Open questions to confirm with Whop (genuinely undocumented)

1. **Clawback / negative-balance policy** after a refund or lost dispute once a seller has been paid out. Mitigated with a reserve/hold window + dispute-freeze, but the authoritative behavior isn't documented.
2. **`application_fee_amount` units + fee/dispute liability** on connected-account checkouts.
3. **Min/max transfer & withdrawal amounts** and insufficient-balance behavior.

## Deploying this sandbox build

Sandbox config stays as-is (`WHOP_BASE_URL=sandbox`, `PAYOUTS_ENABLED=false`); a public link only additionally needs a cloud Supabase (Vercel can't reach local Supabase). See [DEPLOY.md](./DEPLOY.md).
