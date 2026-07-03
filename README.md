# CreatorJobs — Whop Marketplace (prototype)

A two-sided marketplace on Whop. **Buyers** pay for work; **sellers** complete it and get paid.
Whop powers seller onboarding, buyer checkout, payment confirmation, order state, seller
payouts, and the ops dashboard.

Stack: **Next.js 16 (App Router) + Supabase (Postgres/Auth/RLS) + Whop TS SDK (`@whop/sdk`)**.
Design principle: **Whop is the source of truth for money; our Postgres is a read-model + workflow layer.**

## Build status

| Chunk | What | Status |
|------|------|--------|
| 0 | Scaffold + server-only Whop client + `/api/health` smoke test | ✅ done (see note) |
| 1 | Supabase schema + Auth + RLS + typed clients | ✅ done, validated on real Postgres |
| 2 | Seller onboarding — auth, connected account, KYC link, readiness re-check | ✅ done, verified end-to-end |
| 3 | Listings — product + plan, public marketplace | ✅ done, verified end-to-end |
| 4 | Buyer checkout — order row + checkout session + embedded checkout | ✅ done, session verified |
| 5–8 | webhooks/order state, payouts, dashboard, polish | ⏳ planned |

## Buyer checkout (Chunk 4)

- On a listing, **Buy now** (buyer must be signed in) creates the `orders` row **first** (`PENDING_PAYMENT`) — so a webhook can never beat the order into existence (§X1) — then a Whop **checkout session** carrying `metadata.order_id`.
- `/checkout/[orderId]` renders Whop's **`<WhopCheckoutEmbed environment="sandbox">`** (drop-in UI). Test card `4242 4242 4242 4242`.
- Catalog lives under the platform company, so checkout is created under the platform; the seller's cut (`amount − application_fee`, 20%) is transferred to their connected ledger at payout (Chunk 6).
- The return page shows "submitted" — the order flips to **PAID only** on the verified `payment.succeeded` webhook (Chunk 5), never from `?status=success`.

## Seller onboarding (Chunk 2)

- `/login` — Supabase email auth (sign in / sign up). `/seller` — onboarding dashboard (auth-guarded).
- On start: ensure a `sellers` row (dedupe-first), create a **connected account** (`companies.create` with `parent_company_id`), then mint a hosted KYC link (`account-links`).
- **`account-links` requires https return/refresh URLs**, so hosted KYC runs on the deployed (https) build; on local http the connected account still creates and we skip the redirect.
- Readiness (`kyc_status`, `payout_ready`) is **always re-checked against Whop's ledger** (`payments_approval_status` + payout-account `connected`) — never inferred from the return redirect. In sandbox this stays `pending` (payouts disabled) — the real Scenario 2.
- Verified end-to-end: signup → RLS-guarded seller insert → connected account → readiness re-check → cross-user isolation (0 leak).

## ⚠️ API key note (Scenario 3, live)

The provided `apik_…` key is a **production** key, not a sandbox key. `GET /api/health`
against `sandbox-api.whop.com` returns **401**; the same key against `api.whop.com`
returns **200**. That is a textbook environment mismatch:

> **401 = authentication/environment problem** (sandbox key vs prod URL) — not a scope
> problem (that would be **403**).

To test in sandbox, create a sandbox key at `https://sandbox.whop.com/dashboard/developer`
and set it in `.env.local`. To run against production instead, set
`WHOP_BASE_URL=https://api.whop.com/api/v1` (note: real money + connected-account creation
needs Platforms API access, which is invite-only).

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

## Database (Chunk 1)

Schema + RLS live in `supabase/migrations/0001_init.sql`. Apply it to your Supabase
project (SQL editor or `supabase db push`). RLS enforces:

- sellers/buyers see only their own row;
- a seller manages only their own listings; **anyone** can read `active` listings;
- an order is readable only by its buyer or seller;
- `webhook_events` / `outbox_jobs` are **service-role only** (RLS on, no policies).

Two UNIQUE columns are the idempotency ledgers: `webhook_events.whop_webhook_id`
(dedupe at-least-once webhooks) and `payouts.idempotence_key` (mirror Whop transfer
idempotence — blocks double-paying a seller on webhook redelivery).

Clients: `lib/supabase/server.ts` (user session, RLS), `lib/supabase/client.ts`
(browser), `lib/supabase/admin.ts` (service role — trusted server only).

## Stable vs Beta API

Uses the Beta API (`Api-Version-Date` pinned) where available. Documented
**Stable-only** fallbacks: `GET /payments/{id}`, memberships, and webhooks.
