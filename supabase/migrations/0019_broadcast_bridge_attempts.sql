-- 0019: Shared bridge session state, so browser broadcasting works on
-- multi-instance serverless.
--
-- Bridge attempt state used to live in per-process memory (globalThis), which
-- breaks WHIP signaling across Vercel instances — the reason
-- bridgeAllowedInRuntime() refuses to enable the bridge there, and therefore
-- the reason mobile creators (who are bridge-only, because mobile carriers
-- break the UDP that direct WHIP needs) currently get no broadcast target at
-- all.
--
-- Credentials: 0015 stores no publish credential by design. This table must
-- hold one for signaling to resume on another instance, so every credential
-- column is sealed with AES-256-GCM under a key derived from
-- TVINBIO_BRIDGE_CONTROL_SECRET (see src/lib/bridge/secret-box.ts). The
-- database never holds a usable credential; a dump without that server-only
-- env var is inert. Columns are suffixed `_sealed` so this stays obvious.

create table if not exists broadcast_bridge_attempts (
  attempt_id text primary key,
  -- One live attempt per creator; the unique constraint is the backstop that
  -- prevents two concurrent publishers if two instances race.
  creator_id text not null unique,
  livepeer_id text not null,
  category text not null check (category in ('mobile', 'desktop')),
  lease_id text,
  whip_upstream_sealed text,
  publish_token_sealed text,
  resource_id text,
  resource_upstream_sealed text,
  created_at_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists broadcast_bridge_attempts_created_idx
  on broadcast_bridge_attempts (created_at);

-- Lease-rate accounting for shouldAllowLeaseCreation(). Separate from
-- broadcast_bridge_leases because a rate event is recorded *before* the lease
-- is created, so it must not depend on lease lifecycle rows existing.
create table if not exists broadcast_bridge_lease_events (
  id bigserial primary key,
  creator_id text not null,
  at_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists broadcast_bridge_lease_events_creator_idx
  on broadcast_bridge_lease_events (creator_id, at_ms desc);

create index if not exists broadcast_bridge_lease_events_at_idx
  on broadcast_bridge_lease_events (at_ms desc);

-- RLS on, no policies: service-role application path only, matching 0015.
alter table broadcast_bridge_attempts enable row level security;
alter table broadcast_bridge_lease_events enable row level security;

revoke all on broadcast_bridge_attempts from anon;
revoke all on broadcast_bridge_attempts from authenticated;
revoke all on broadcast_bridge_lease_events from anon;
revoke all on broadcast_bridge_lease_events from authenticated;
revoke all on sequence broadcast_bridge_lease_events_id_seq from anon;
revoke all on sequence broadcast_bridge_lease_events_id_seq from authenticated;

-- Attempts are bounded by BRIDGE_LEASE_MAX_DURATION_MS (6h); rate windows by
-- BRIDGE_LEASE_RATE_WINDOW_MS (60s). Reads already filter on age, so this is
-- storage hygiene, not a correctness gate.
create or replace function prune_bridge_session_state()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from broadcast_bridge_attempts where created_at < now() - interval '6 hours';
  delete from broadcast_bridge_lease_events where created_at < now() - interval '1 hour';
end;
$$;

revoke execute on function prune_bridge_session_state() from anon, authenticated;

-- Every 15 minutes. If pg_cron is unavailable this no-ops with a notice; the
-- human then schedules it via Supabase dashboard → Database → Cron.
do $$ begin
  perform cron.schedule('prune-bridge-session-state', '*/15 * * * *', 'select prune_bridge_session_state()');
exception when others then
  raise notice 'pg_cron unavailable; schedule prune_bridge_session_state() manually';
end $$;
