-- Broadcast bridge lease lifecycle metadata (spec §7.3). Server-only table:
-- ownership, idempotency, cleanup, and incident review survive app restarts.
-- It stores NO stream key, RTMP destination, or publish credential — those
-- live only in bridge-agent memory for the lease lifetime.

create table if not exists broadcast_bridge_leases (
  id uuid primary key default gen_random_uuid(),
  lease_id text,
  attempt_id text not null,
  creator_id text not null,
  livepeer_id text not null,
  status text not null default 'created',
  reason text,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create unique index if not exists broadcast_bridge_leases_lease_id_key
  on broadcast_bridge_leases (lease_id)
  where lease_id is not null;

create index if not exists broadcast_bridge_leases_attempt_idx
  on broadcast_bridge_leases (attempt_id);

create index if not exists broadcast_bridge_leases_creator_idx
  on broadcast_bridge_leases (creator_id, created_at desc);

-- RLS on, no policies: only the service-role application path may touch this
-- table. Data API privileges are revoked from the public roles explicitly.
alter table broadcast_bridge_leases enable row level security;

revoke all on broadcast_bridge_leases from anon;
revoke all on broadcast_bridge_leases from authenticated;
