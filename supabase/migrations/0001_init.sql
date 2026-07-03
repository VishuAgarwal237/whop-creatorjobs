-- CreatorJobs — Chunk 1 schema, indexes, and Row Level Security.
--
-- Design principle (see architecture doc §5): Whop is the source of truth for
-- money; these tables are a fast, queryable read-model + workflow layer. Two
-- UNIQUE columns are the idempotency ledgers that keep webhooks and payouts
-- exactly-once:
--   * webhook_events.whop_webhook_id   (dedupe at-least-once webhook delivery)
--   * payouts.idempotence_key          (mirror Whop transfer idempotence)

-- Supabase provides gen_random_uuid() via pgcrypto/pg_catalog on hosted projects.
create extension if not exists "pgcrypto";

-- ---------- enums ----------
create type order_status as enum (
  'DRAFT', 'PENDING_PAYMENT', 'PROCESSING', 'PAID',
  'FULFILLED', 'SETTLED', 'FAILED', 'REFUNDED', 'DISPUTED'
);
create type kyc_status as enum ('pending', 'approved', 'rejected');
create type listing_status as enum ('draft', 'active', 'archived');
create type payout_status as enum ('pending', 'in_transit', 'completed', 'failed', 'stubbed');
create type job_status as enum ('pending', 'processing', 'done', 'failed');

-- ---------- identities ----------
create table sellers (
  id                uuid primary key default gen_random_uuid(),
  supabase_user_id  uuid not null references auth.users (id) on delete cascade,
  whop_company_id   text unique,               -- biz_… connected sub-business (null until created)
  email             text not null,
  kyc_status        kyc_status not null default 'pending',
  payout_ready      boolean not null default false,
  created_at        timestamptz not null default now()
);
create unique index sellers_user_uidx on sellers (supabase_user_id);

create table buyers (
  id                uuid primary key default gen_random_uuid(),
  supabase_user_id  uuid not null references auth.users (id) on delete cascade,
  email             text not null,
  created_at        timestamptz not null default now()
);
create unique index buyers_user_uidx on buyers (supabase_user_id);

-- ---------- catalog ----------
create table listings (
  id                uuid primary key default gen_random_uuid(),
  seller_id         uuid not null references sellers (id) on delete cascade,
  title             text not null,
  description       text,
  price_cents       bigint not null check (price_cents >= 0),
  currency          text not null default 'usd',
  whop_product_id   text,
  whop_plan_id      text,
  status            listing_status not null default 'draft',
  created_at        timestamptz not null default now()
);
create index listings_seller_idx on listings (seller_id);
create index listings_status_idx on listings (status);

-- ---------- orders (workflow state; Whop is truth) ----------
create table orders (
  id                       uuid primary key default gen_random_uuid(),
  listing_id               uuid not null references listings (id),
  buyer_id                 uuid not null references buyers (id),
  seller_id                uuid not null references sellers (id),
  status                   order_status not null default 'DRAFT',
  whop_checkout_config_id  text,
  whop_payment_id          text unique,        -- unique so a redelivered webhook can't fork the order
  whop_membership_id       text,
  amount_cents             bigint not null check (amount_cents >= 0),
  application_fee_cents     bigint not null default 0 check (application_fee_cents >= 0),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index orders_buyer_idx on orders (buyer_id);
create index orders_seller_idx on orders (seller_id);
create index orders_status_idx on orders (status);

-- ---------- payouts ----------
create table payouts (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders (id),
  seller_id         uuid not null references sellers (id),
  whop_transfer_id  text,
  whop_withdrawal_id text,
  idempotence_key   text not null unique,       -- = whop_payment_id; blocks double-pay on webhook redelivery
  amount_cents      bigint not null check (amount_cents >= 0),
  status            payout_status not null default 'pending',
  error_code        text,
  created_at        timestamptz not null default now()
);
create index payouts_seller_idx on payouts (seller_id);

-- ---------- webhook idempotency ledger + async outbox (service-role only) ----------
create table webhook_events (
  id                 uuid primary key default gen_random_uuid(),
  whop_webhook_id    text not null unique,       -- dedup key (webhook-id header)
  event_type         text not null,
  payload            jsonb not null,
  signature_verified boolean not null default false,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  process_error      text
);
create index webhook_events_type_idx on webhook_events (event_type);

create table outbox_jobs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  ref_id      text not null,
  run_after   timestamptz not null default now(),
  attempts    int not null default 0,
  last_error  text,
  status      job_status not null default 'pending',
  created_at  timestamptz not null default now()
);
create index outbox_jobs_claim_idx on outbox_jobs (status, run_after);

-- keep orders.updated_at fresh
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger orders_set_updated_at before update on orders
  for each row execute function set_updated_at();

-- ======================================================================
-- Row Level Security
-- The service role (webhook worker + /admin) bypasses RLS entirely, so
-- webhook_events and outbox_jobs get RLS enabled with NO policies = locked
-- to the service role only. Everything else is scoped to the signed-in user.
-- ======================================================================
alter table sellers        enable row level security;
alter table buyers         enable row level security;
alter table listings       enable row level security;
alter table orders         enable row level security;
alter table payouts        enable row level security;
alter table webhook_events enable row level security;
alter table outbox_jobs    enable row level security;

-- sellers / buyers: a user sees and edits only their own row
create policy sellers_own on sellers
  for all to authenticated
  using (supabase_user_id = auth.uid())
  with check (supabase_user_id = auth.uid());

create policy buyers_own on buyers
  for all to authenticated
  using (supabase_user_id = auth.uid())
  with check (supabase_user_id = auth.uid());

-- listings: anyone (incl. anon) can read ACTIVE listings; a seller manages their own
create policy listings_public_read on listings
  for select to anon, authenticated
  using (status = 'active');

create policy listings_seller_manage on listings
  for all to authenticated
  using (seller_id in (select id from sellers where supabase_user_id = auth.uid()))
  with check (seller_id in (select id from sellers where supabase_user_id = auth.uid()));

-- orders: readable by the buyer OR the seller on the order
create policy orders_participant_read on orders
  for select to authenticated
  using (
    buyer_id  in (select id from buyers  where supabase_user_id = auth.uid())
    or seller_id in (select id from sellers where supabase_user_id = auth.uid())
  );

-- payouts: readable by the owning seller
create policy payouts_seller_read on payouts
  for select to authenticated
  using (seller_id in (select id from sellers where supabase_user_id = auth.uid()));
