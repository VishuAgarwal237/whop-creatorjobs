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

I want to be upfront about the two, and only two, spots where something is faked, because everything else along the way is a genuine call.

The first of them is the payout transfer itself, where the final step that would move money off the platform is stubbed in the sandbox, and yet every step leading up to that point is entirely real, including recording the payout intent, holding it through the reserve window, freezing it on a dispute, keeping it idempotent, and reading the live ledger balance. The second is webhook delivery, which only became an issue because Whop cannot deliver a webhook to localhost, so to exercise the handler while I was building locally I signed my own payloads with the real Standard Webhooks secret and posted them at the endpoint before letting the reconciliation cron take over from there. Since the handler code is exactly what runs in production, deploying it was simply a matter of pointing a real sandbox webhook at the deployed URL, and that is in fact now wired up on the live build, so on the deployed version the webhook path runs for real rather than being simulated.

Everything else is a real sandbox API call, and that covers creating connected accounts, generating the hosted KYC link, creating products and plans, creating checkout sessions, rendering the embedded checkout, pulling a payment back, and reading a ledger.

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
| `ledgerAccounts.retrieve()` | `GET /ledger_accounts/{id}` | payout readiness and balance | Stable (the Ledger Accounts resource is under the standard reference; the Beta "Ledgers → List Financial Activity" is a separate endpoint I do not call) |
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

A couple of notes so nobody reads too much into that table. First, I never actually call a memberships endpoint, I only read the `membership` field that already comes back on the payment object, so there is no separate membership API in play. Second, the calls that necessarily sit on Stable are the ones that have no Beta equivalent I could have reached for instead, and that covers the payment reads together with refund and retry, the ledger-account read, the payout-account and payout-method reads, the connected-account create, the hosted KYC link, and the webhook verification. Two of those are worth spelling out so the classification is honest. The Beta "Ledgers → List Financial Activity" endpoint is a genuinely different thing from the ledger-account retrieve I rely on for approval status and balance, so it is not a drop-in swap and the retrieve stays on Stable. And the connected-account create goes through the SDK's `companies.create`, which is the older path, whereas the Beta "Accounts" resource also creates connected accounts and could probably take its place in a later pass.

One more bit of honesty on how I confirmed all this: Whop's public docs do not spell the split out on a normal page, and the getting-started page does not mention stability tiers at all. The Experimental-versus-Stable distinction lives in the "Experimental" dropdown in the docs UI, which is exactly the toggle the brief points at, so the source of truth for which resource is Beta is which side of that dropdown its `/api-reference/` page sits on rather than anything I could re-derive from a single fetched page.

## Things I would want to confirm with Whop

A few behaviors are genuinely not written down anywhere I could find, and because they matter for real money these are the questions I would take back to Whop before going live.

The first is what actually happens on a clawback, because if a buyer is refunded or wins a dispute after the seller has already been paid out, I do not know for certain whether the seller's balance is allowed to go negative, whether Whop pulls the money back on its own, or whether the platform ends up eating it, and while I guard against that today with a reserve window and a freeze on dispute, the underlying policy is not something I could find documented. The second is how `application_fee_amount` actually behaves on a connected-account checkout, both in terms of the units it expects and in terms of who is ultimately on the hook for the fees and for any disputes. The third is where the minimum and maximum amounts sit for transfers and withdrawals, and what happens when the origin ledger simply does not hold enough to cover one of them.

## Deploying this sandbox build

Nothing here needs to leave the sandbox. The config stays exactly as it is (`WHOP_BASE_URL` pointed at the sandbox, `PAYOUTS_ENABLED=false`), and the only extra thing a public link needs is a cloud Supabase, because Vercel cannot reach a Supabase running on my laptop. The steps are in DEPLOY.md.
