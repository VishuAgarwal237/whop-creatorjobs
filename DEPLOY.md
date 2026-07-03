# Deploying CreatorJobs — sandbox only

This app is intentionally **sandbox-only**: it talks to the Whop **sandbox**, uses test
cards, and **stubs payouts** (`PAYOUTS_ENABLED=false`) — no real money ever moves. Keep it
that way for the take-home. These steps need **your** accounts (browser login), so run them
yourself.

## Run locally (recommended for the demo)

```bash
npm install
cp .env.example .env.local     # fill in the sandbox WHOP_API_KEY + platform biz_ id
npx supabase start             # local Postgres+Auth; applies supabase/migrations
# copy the printed API URL + anon + service_role keys into .env.local
npm run dev                    # http://localhost:3001 (3000 may be taken)
```

Everything runs on the Whop sandbox: sign up, onboard a seller, create a listing, buy it
with test card `4242 4242 4242 4242`. Order confirmation, order state, and (stubbed) payout
all work end-to-end.

## Optional: put the sandbox build on Vercel (for a public submission link)

Still sandbox — do **not** switch to a production Whop key or enable real payouts.

1. **Cloud Supabase** (Vercel can't reach your local Supabase): create a project, run
   `supabase/migrations/0001_init.sql` in the SQL Editor, copy URL + anon + service_role keys.
2. **Whop sandbox webhook**: at `sandbox.whop.com/dashboard/developer` create a webhook to
   `https://<your-vercel-domain>/api/webhooks/whop` (events: `payment.*`, `refund.*`,
   `dispute.*`, `membership.activated`, `payout_account.status_updated`); copy its secret.
3. **Vercel env vars** (Production) — all sandbox:
   ```
   WHOP_API_KEY=<sandbox key>
   WHOP_BASE_URL=https://sandbox-api.whop.com/api/v1     # sandbox, not prod
   WHOP_API_VERSION_DATE=2026-07-01
   WHOP_WEBHOOK_SECRET=<sandbox webhook secret>
   WHOP_PLATFORM_COMPANY_ID=biz_...                       # your sandbox business
   NEXT_PUBLIC_APP_URL=https://<your-vercel-domain>
   NEXT_PUBLIC_SUPABASE_URL=... / NEXT_PUBLIC_SUPABASE_ANON_KEY=... / SUPABASE_SERVICE_ROLE_KEY=...
   ADMIN_EMAILS=you@yourdomain.com
   PAYOUTS_ENABLED=false                                  # keep stubbed — sandbox has no payouts
   PAYOUT_RESERVE_SECONDS=60
   CRON_SECRET=<optional; protects /api/cron on Vercel>   # e.g. openssl rand -hex 32
   ```
4. Deploy from GitHub (Next.js auto-detected). `vercel.json` schedules `/api/cron` every minute.
   Set the project to **public access**.

## Smoke test

`GET /api/health` → `{ ok: true, environment: "sandbox", account: { id: "biz_…" } }`.

## Notes

- `NEXT_PUBLIC_APP_URL` must be `https://…` on Vercel so Whop `account-links` (hosted KYC)
  accept the return/refresh URLs — that flow needs https and is skipped on local http.
- Never commit `.env.local`. Rotate any key shared in plaintext.
