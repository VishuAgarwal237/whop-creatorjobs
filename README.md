# CreatorJobs — Whop Marketplace (prototype)

A two-sided marketplace on Whop. **Buyers** pay for work; **sellers** complete it and get paid.
Whop powers seller onboarding, buyer checkout, payment confirmation, order state, seller
payouts, and the ops dashboard.

Stack: **Next.js 16 (App Router) + Supabase (Postgres/Auth/RLS) + Whop TS SDK (`@whop/sdk`)**.
Design principle: **Whop is the source of truth for money; our Postgres is a read-model + workflow layer.**

**Submission:** [SCENARIOS.md](./SCENARIOS.md) (the four written answers) · [LIMITATIONS.md](./LIMITATIONS.md) (sandbox limits + mocks/adaptations) · [DEPLOY.md](./DEPLOY.md) (Vercel + cloud Supabase) · Loom (pending).

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
| 0 | Scaffold + server-only Whop client + `/api/health` smoke test | ✅ done (see note) |
| 1 | Supabase schema + Auth + RLS + typed clients | ✅ done, validated on real Postgres |
| 2 | Seller onboarding — auth, connected account, KYC link, readiness re-check | ✅ done, verified end-to-end |
| 3 | Listings — product + plan, public marketplace | ✅ done, verified end-to-end |
| 4 | Buyer checkout — order row + checkout session + embedded checkout | ✅ done, session verified |
| 5 | Webhooks + order state machine + reconciliation | ✅ done, verified end-to-end |
| 6 | Seller payout — reserve/hold, readiness-gated, idempotent, dispute-frozen | ✅ done, verified end-to-end |
| 7 | Ops dashboard `/admin` — payments, order state, payouts, webhook delivery | ✅ done |
| 8 | Polish — design pass, scenario answers, deploy guide (sandbox) | ✅ done (Loom pending) |

**Submission checklist:** ✅ GitHub repo · ✅ [scenario answers](./SCENARIOS.md) · ✅ [deploy guide](./DEPLOY.md) (sandbox) · ⏳ Loom · ⏳ public Vercel link (optional; keep sandbox config).

## Ops dashboard (Chunk 7 — Scenario 4)

- `/admin` (service role; gated by `ADMIN_EMAILS` allowlist) shows it all on one screen:
  **orders** with our status + **live `GET /payments/{id}` status/substatus** and a mismatch flag; **payouts** (status, transfer id, error); **webhook delivery** (event, signature verified, processed, error); an **order-activity** audit trail (every state transition + reason + source).
- **Per-order ops actions** (act, don't just observe): **re-check** (re-derive from Whop truth), **refund** (`payments.refund` on captured orders), and **retry** (`payments.retry` on failed orders). Each just calls Whop — the resulting webhook advances the order, keeping Whop the source of truth.
- A **Run reconciliation** button triggers the same idempotent sweep as the cron (`lib/ops.ts` → outbox drain + stuck-order heal + payout release).
- Answers the customer's ask: "one dashboard showing buyer payment, order state, seller payout status, webhook delivery, and errors."

## Seller payout (Chunk 6)

- On order **PAID**, a payout **intent** row is recorded (idempotent on `whop_payment_id` — mirrors Whop transfer idempotence). Amount = order total − platform fee (20%).
- The cron **releases** payouts only after a **reserve/hold window** (clawback safety), and **never** while the order is `DISPUTED`/`REFUNDED` (frozen → `failed`). Real releases require seller readiness (Verification `approved` + payout account `connected`).
- **Sandbox**: real payouts are disabled (`transfers.create` → 400 *"Sends are only supported from an Ethereum wallet"*), so releases are **stubbed** (`status: stubbed`) behind `PAYOUTS_ENABLED=false`; production runs `whop.transfers.create` platform → seller ledger with `idempotence_key`.
- Sellers see payouts + live Whop ledger balance on `/seller`.
- **Payout setup panel** (`/seller`): surfaces the live payout-account status (`payout_accounts.retrieve` → `connected` / `pending_verification` / `action_required` / `not_started`…) and any connected payout methods (`payout_methods.list`), so "onboarded but can't withdraw" (Scenario 2) is self-diagnosable — and the sandbox reason reads as expected, not a bug.
- Verified end-to-end: intent idempotency, reserve hold, release→stubbed, dispute→frozen.

## Webhooks & order state (Chunk 5)

- `POST /api/webhooks/whop`: **verify** (`webhooks.unwrap` — Standard Webhooks sig + timestamp/replay) → **dedupe** on `webhook-id` (`webhook_events` UNIQUE) → **process** inline (idempotent, monotonic) → 2xx. Bad signature → 400.
- **Webhook = signal, API = truth**: `payment.*` events re-read `GET /payments/{id}` before advancing the order (`PENDING_PAYMENT→PROCESSING→PAID`). Monotonic — a late `payment.pending` never regresses a `PAID` order. `refund/dispute` freeze the order (`REFUNDED`/`DISPUTED`).
- **Webhook-before-order race**: if the order isn't in our DB yet, the event is stored with a `process_error` + an `outbox_jobs` entry; the reconciliation cron retries and heals it.
- `GET /api/cron` (Vercel Cron, every minute — `vercel.json`): drains the outbox and self-heals orders stuck in `PENDING_PAYMENT/PROCESSING` by reading the payment from Whop (covers fully-missed/out-of-order deliveries). Protected by `CRON_SECRET`.
- Buyers see live order status at `/orders`.
- Verified end-to-end: bad-sig 400, succeeded→PAID, duplicate deduped, out-of-order no-regress, and the race→outbox→cron heal.

## Seller listings (Chunk 3)

- `/seller/listings`: a seller **creates** a listing → it's mirrored to Whop as a **product + one-time plan** (`products.create` + `plans.create`, under the platform company; see LIMITATIONS row 5). Active listings appear on the public `/marketplace`.
- **Edit** (inline): change title, description, price, or status (active/archived) → synced to the Whop **product** (`products.update`, incl. visibility) and **plan** (`plans.update`, incl. `initial_price`) so checkout charges the new amount.
- **Delete**: removes the mirrored Whop **plan + product** (`plans.delete` / `products.delete`, best-effort), then deletes our row — or **archives** it (kept off the marketplace) if the listing already has orders, so buyer/order history stays intact.
- Scoped by RLS: a seller manages only their own listings.

## Buyer checkout (Chunk 4)

- On a listing, **Buy now** (buyer must be signed in) creates the `orders` row **first** (`PENDING_PAYMENT`) — so a webhook can never beat the order into existence (§X1) — then a Whop **checkout session** carrying `metadata.order_id`.
- `/checkout/[orderId]` renders Whop's **`<WhopCheckoutEmbed environment="sandbox">`** (drop-in UI). Test card `4242 4242 4242 4242`.
- Catalog lives under the platform company, so checkout is created under the platform; the seller's cut (`amount − application_fee`, 20%) is transferred to their connected ledger at payout (Chunk 6).
- The return page shows "submitted" — the order flips to **PAID only** on the verified `payment.succeeded` webhook (Chunk 5), never from `?status=success`.

## Seller onboarding (Chunk 2)

- `/login` — Supabase email auth with a **tabbed Sign in / Create account** form (one primary button, errors return to the correct tab). `/seller` — onboarding dashboard (auth-guarded).
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

## UI / design system

A small shared kit (`components/ui.tsx`) keeps the surface consistent: one **primary action color** (blue) for the main action on every page, `outline` for secondary, `danger` (red) for destructive (delete/refund); brand **orange** is reserved for identity (logo, step numbers), never an action. A single `StatusBadge` renders every state — order, listing, KYC, payout, and payout-account statuses — from one style map, so a status looks the same wherever it appears. Global base CSS restores the pointer cursor on buttons (Tailwind v4 drops it).

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

Uses the Beta API (`Api-Version-Date` pinned) where available — products/plans (create,
update, delete), checkout-configurations, ledger-accounts, transfers. Documented
**Stable-only** calls: `payments.retrieve/list/refund/retry`, `payout_accounts`,
`payout_methods`, connected-account create, `account-links`, and webhook verification.
Full call-by-call breakdown in [LIMITATIONS.md](./LIMITATIONS.md).
