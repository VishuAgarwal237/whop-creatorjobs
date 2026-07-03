-- CreatorJobs — Chunk 8: observability.
--
-- The orders table records only an order's CURRENT status; when ops asks "why did
-- this sit in PROCESSING for two hours?" there was no history to answer from. This
-- adds an append-only audit trail of every state transition, written by the same
-- trusted server code that advances orders (webhook worker, cron reconciliation,
-- and the admin "re-check" button). It is a read-model for humans — Whop remains
-- the source of truth for money.

create table order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders (id) on delete cascade,
  from_status order_status,                 -- null for the very first observation
  to_status   order_status not null,
  reason      text not null,                -- e.g. 'payment.succeeded', 'refund.created', 'reconcile'
  source      text not null,                -- 'webhook' | 'cron' | 'reconcile' | 'manual'
  detail      jsonb,                         -- optional context (payment status/substatus, etc.)
  created_at  timestamptz not null default now()
);
create index order_events_order_idx on order_events (order_id, created_at desc);
create index order_events_created_idx on order_events (created_at desc);

-- Service-role only (webhook worker, cron, /admin). RLS enabled with NO policies =
-- locked to the service role, exactly like webhook_events / outbox_jobs.
alter table order_events enable row level security;

-- table-level privilege the service role sits on top of (it also bypasses RLS)
grant all on order_events to service_role;
