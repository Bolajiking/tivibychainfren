-- TVinBio — payment idempotency ledger.
-- Every settled money moment claims its tx_hash here BEFORE any access/order
-- write. The primary key makes a replay of the same on-chain transaction a
-- no-op: a second settle attempt hits a unique violation and is rejected.
-- Written only by the settle route via the service-role key (RLS on, no anon
-- or authenticated policy), so it bypasses RLS and stays invisible to clients.

create table if not exists settled_payments (
  tx_hash     text primary key,
  moment      text not null,                 -- unlock | subscribe | tip | buy
  payer       text not null,                 -- lowercase wallet that paid
  recipient   text not null,                 -- lowercase creator wallet
  amount      numeric not null default 0,
  resource_id text,                          -- playback_id / product id when relevant
  created_at  timestamptz not null default now()
);
create index if not exists settled_payments_payer_idx on settled_payments(payer);
create index if not exists settled_payments_recipient_idx on settled_payments(recipient);

alter table settled_payments enable row level security;
-- No policies: anon/authenticated get zero rows. Only the service-role server
-- route (which bypasses RLS) reads or writes this table.
revoke all on settled_payments from anon, authenticated;
