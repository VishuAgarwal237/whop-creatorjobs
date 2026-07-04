# Sandbox limitations, mocks, and adaptations

I built this straight against the Whop sandbox, the way the brief asked. That meant a handful of things simply could not run in the sandbox, and a few others behaved in ways the docs did not spell out, so I had to adapt around them. Everything written here I checked against the real sandbox API before putting it down, so these are things I actually ran into rather than things I am guessing about.

## Limitations and adaptations

This first table covers both the documented sandbox limits (rows 1 to 4) and the Whop API behaviors I bumped into while building (rows 5 to 9). For each one I have written down what I saw, what I did about it, and what would change if this were pointed at production instead of the sandbox.

| # | What I saw (checked in the sandbox) | What I did about it | What changes in production |
|---|---|---|---|
| 1 | Payouts are turned off in the sandbox, and `transfers.create` comes back with `400 "Sends are only supported from an Ethereum wallet"`. | Stubbed the release behind `PAYOUTS_ENABLED=false`. The payout row still gets created and gated (reserve window, dispute freeze, idempotency) exactly like production, it just gets marked `stubbed` instead of moving money. | Set `PAYOUTS_ENABLED=true` and the same code calls `whop.transfers.create` (platform to seller ledger, with the payment id as the idempotency key). |
| 2 | KYC never actually finishes in the sandbox, so a connected account's ledger `payments_approval_status` stays `null` or `pending` and no payout account ever reaches `connected`. | `payout_ready` correctly stays false, and I show it as expected sandbox behavior (this is take-home Scenario 2). I always re-read readiness from the Whop ledger rather than assuming it. | Real KYC through the hosted portal flips the approval, and `payout_ready` becomes true. |
| 3 | Apps and messaging are disabled in the sandbox. | Built this as a standalone Next.js app with Supabase Auth, so it does not lean on the Whop app-user token (`x-whop-user-token`). | Could optionally run it as a Whop App, or add Sign in with Whop (OAuth). |
| 4 | Only card payments work in the sandbox, so no Apple Pay, Google Pay, or other methods. | Demoed checkout with the test card `4242 4242 4242 4242`. | Nothing to change, Whop turns the other methods on automatically. |
| 5 | `plans.create` returns 404 for a connected account, even though `products.create` works for that same account and `plans.create` works fine on the platform's own company. Plan creation only works on the company the key owns. | Create the catalog (product and plan) under the platform company and tag each one with `metadata.seller_company_id`. The connected account is still the payout destination, so the seller's cut is transferred to its ledger at settlement. | Nothing to change, the same path works in production. |
| 6 | `account-links` will not accept `http` return or refresh URLs, so `http://localhost` comes back with `400 "Refresh URL must start with 'https://'"`. | On a local `http` host I skip the redirect (the connected account still gets created) and show a short note. | The hosted KYC link works on the deployed `https` build, and readiness is re-checked from the ledger afterward. |
| 7 | The email on a connected account has to have real MX records, so `example.com` comes back with `400 "does not accept incoming mail"`. | Require an email that can actually receive mail (I use gmail addresses in the demo). | Nothing to change. |
| 8 | The API key I was originally handed was a production key, so it returned 401 on the sandbox and 200 on production. This is take-home Scenario 3 happening for real. | Switched to a real sandbox key. `/api/health` tells a 401 (auth or environment) apart from a 403 (scope) so this is quick to diagnose. | Use the production key together with `WHOP_BASE_URL` pointed at `api.whop.com`. |
| 9 | `plan.initial_price` is in whole dollars as a decimal (like `10.43`), not in cents. That is not documented anywhere, I found it by testing. | Convert our integer cents to dollars when creating a plan. | Nothing to change. |

## What I actually mocked

I want to be upfront about the two, and only two, spots where something is faked, because everything else is a real call:

* Payout transfers. As above, the final step where money would leave the platform is a stub in the sandbox, but every step leading up to it (the intent, the reserve hold, the dispute freeze, the idempotency, the ledger balance read) is real.
* Webhook delivery. Whop cannot deliver a webhook to localhost, so to test the handler I signed my own payloads with the real Standard Webhooks secret and posted them at the endpoint, then let the reconciliation cron do its thing. The handler code itself is exactly what would run in production, and once this is deployed you just point a real sandbox webhook at the deployed URL, nothing in the code changes.

Everything else is a real sandbox API call: creating connected accounts, generating the hosted KYC link, creating products and plans, creating checkout sessions, rendering the embedded checkout, pulling a payment back, and reading a ledger.

## Experimental (Beta) versus Stable API, and where I had to use Stable

The brief asked me to lean on the Experimental (Beta) API and to flag anywhere I fell back to Stable, so here is exactly that. There is no separate base URL for the two, the `@whop/sdk` client is just pinned to a dated version through the `Api-Version-Date` header, which means every call already gets the newest (experimental) request and response shapes. Whop's Beta versus Stable split is really a docs thing, it comes down to which resources have a `/api-reference/beta/` page. Here is every specific call I make and which side it lands on:

| SDK call | REST endpoint | Used for | Surface |
|---|---|---|---|
| `accounts.me()` | `GET /accounts/me` | auth and environment health check | Beta |
| `products.create()` | `POST /products` | listing to product | Beta |
| `plans.create()` | `POST /plans` | listing to one-time plan | Beta |
| `products.update()` / `plans.update()` | `PATCH /products/{id}` · `PATCH /plans/{id}` | edit a listing (title, description, price, visibility) | Beta |
| `products.delete()` / `plans.delete()` | `DELETE /products/{id}` · `DELETE /plans/{id}` | delete a listing (best-effort catalog cleanup) | Beta |
| `checkoutConfigurations.create()` | `POST /checkout-configurations` | buyer checkout session | Beta |
| `ledgerAccounts.retrieve()` | `GET /ledger_accounts/{id}` | payout readiness and balance | Beta |
| `transfers.create()` | `POST /transfers` | seller payout (production) | Beta |
| `companies.create()` | `POST /companies` | seller connected account | Stable (standard reference, no Beta page) |
| `accountLinks.create()` | `POST /account-links` | hosted KYC and payout portal | Stable (standard reference, no Beta page) |
| `payments.retrieve()` | `GET /payments/{id}` | payment confirmation, the API-is-truth read | Stable (no Beta variant) |
| `payments.list()` | `GET /payments` | reconciliation, finding a payment by checkout config | Stable (no Beta variant) |
| `payments.refund()` | `POST /payments/{id}/refund` | refund an order from the ops dashboard | Stable (no Beta variant) |
| `payments.retry()` | `POST /payments/{id}/retry` | retry a failed payment from the ops dashboard | Stable (no Beta variant) |
| `payoutAccounts.retrieve()` | `GET /payout_accounts/{id}` | seller Payout setup panel — account/KYC status | Stable (no Beta page) |
| `payoutMethods.list()` | `GET /payout_methods` | seller Payout setup panel — connected methods | Stable (no Beta page) |
| `webhooks.unwrap()` | Standard Webhooks verify | verifying and receiving Whop webhooks | Stable (documented under standard reference) |

A couple of notes so nobody reads too much into that table. First, I never actually call a memberships endpoint, I only read the `membership` field that already comes back on the payment object, so there is no separate membership API in play. Second, the Stable calls I could not avoid are the payment reads and the webhook verification, because those two sit right on the path where the webhook tells me something happened and the API tells me the truth, and there is no Beta version of either. The connected-account create and the KYC link are also Stable, because Whop only documents those under the standard reference.

## Things I would want to confirm with Whop

A few behaviors are genuinely not written down anywhere I could find, and they matter for real money, so these are the questions I would take back to Whop before going live:

* What actually happens on a clawback. If a buyer gets refunded or wins a dispute after the seller has already been paid out, does the seller's balance go negative, does Whop pull it back on its own, or does the platform eat it? I guard against this with a reserve window and a freeze on dispute, but the real policy is not documented.
* How `application_fee_amount` works on a connected-account checkout, both the units it expects and who is on the hook for fees and disputes.
* The minimum and maximum amounts for transfers and withdrawals, and what happens when the origin ledger does not have enough in it.

## Deploying this sandbox build

Nothing here needs to leave the sandbox. The config stays exactly as it is (`WHOP_BASE_URL` pointed at the sandbox, `PAYOUTS_ENABLED=false`), and the only extra thing a public link needs is a cloud Supabase, because Vercel cannot reach a Supabase running on my laptop. The steps are in DEPLOY.md.
