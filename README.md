# CreatorJobs — Whop Marketplace (prototype)

A two-sided marketplace on Whop. **Buyers** pay for work; **sellers** complete it and get paid.
Whop powers seller onboarding, buyer checkout, payment confirmation, order state, seller
payouts, and the ops dashboard.

Stack: **Next.js 16 (App Router) + Supabase (Postgres/Auth/RLS) + Whop TS SDK (`@whop/sdk`)**.
Design principle: **Whop is the source of truth for money; our Postgres is a read-model + workflow layer.**

**Submission:** [SCENARIOS.md](./SCENARIOS.md) (the four written answers) · [LIMITATIONS.md](./LIMITATIONS.md) (sandbox limits + mocks/adaptations) · [DEPLOY.md](./DEPLOY.md) (Vercel + cloud Supabase) · Loom 

### The six Whop-powered capabilities → where they live

| Capability | In the app | Whop API |
|---|---|---|
| Seller onboarding | `/seller` | `companies.create`, `account-links` |
| Buyer checkout | `/listing/[id]` → `/checkout` | `checkout-configurations` + `<WhopCheckoutEmbed>` |
| Payment confirmation | `/api/webhooks/whop` | `webhooks.unwrap` + `payments.retrieve` |
| Order state | `/orders`, `/admin` | payment status → state machine |
| Seller payout setup | `/seller` (payout + earnings) | `ledger_accounts`, `payout_accounts`, `payout_methods`, `transfers` |
| Marketplace dashboard | `/admin` | `payments` (retrieve + `refund`/`retry`), `ledger_accounts` |

## Build status

| Chunk | What | Status |
|------|------|--------|
| 0 | Scaffold + server-only Whop client + `/api/health` smoke test | ✅ done |
| 1 | Supabase schema + Auth + RLS + typed clients | ✅ done, validated on real Postgres |
| 2 | Seller onboarding — auth, connected account, KYC link, readiness re-check | ✅ done, verified end-to-end |
| 3 | Listings — product + plan, public marketplace | ✅ done, verified end-to-end |
| 4 | Buyer checkout — order row + checkout session + embedded checkout | ✅ done, session verified |
| 5 | Webhooks + order state machine + reconciliation | ✅ done, verified end-to-end |
| 6 | Seller payout — reserve/hold, readiness-gated, idempotent, dispute-frozen | ✅ done, verified end-to-end |
| 7 | Ops dashboard `/admin` — payments, order state, payouts, webhook delivery | ✅ done |
| 8 | Polish — design pass, scenario answers, deploy guide (sandbox) | ✅ done |




## Setup

```bash
npm install
cp .env.example .env.local   # fill in WHOP_API_KEY and Supabase keys
npm run dev                  # http://localhost:3000
```

Smoke test (Chunk 0):

```bash
# quick standalone check against whichever env WHOP_BASE_URL points at
set -a; . ./.env.local; set +a
node scripts/smoke.mjs
# or, with the app running:
curl -s localhost:3000/api/health | jq
```

## Stable vs Beta API

Uses the Beta API (`Api-Version-Date` pinned) where available — products/plans (create,
update, delete), checkout-configurations, ledger-accounts, transfers. Documented
**Stable-only** calls: `payments.retrieve/list/refund/retry`, `payout_accounts`,
`payout_methods`, connected-account create, `account-links`, and webhook verification.
Full call-by-call breakdown in [LIMITATIONS.md](./LIMITATIONS.md).
