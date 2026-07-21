-- 0018: Monthly access actually expires (D3).
-- Removes a wallet from streams/videos paid_users[] when it has no
-- non-expired subscription row for that creator. One-time unlocks insert
-- subscriptions with expires_at NULL, so they stay permanent. Runs nightly
-- via pg_cron (available on Supabase).

create or replace function prune_expired_paid_users()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update streams s
     set paid_users = coalesce((
       select array_agg(w) from unnest(s.paid_users) as w
       where exists (
         select 1 from subscriptions sub
         where sub.creator_id = s.creator_id
           and sub.subscriber_address = w
           and (sub.expires_at is null or sub.expires_at > now())
       )
     ), '{}')
   where cardinality(s.paid_users) > 0;

  update videos v
     set paid_users = coalesce((
       select array_agg(w) from unnest(v.paid_users) as w
       where exists (
         select 1 from subscriptions sub
         where sub.creator_id = v.creator_id
           and sub.subscriber_address = w
           and (sub.expires_at is null or sub.expires_at > now())
       )
     ), '{}')
   where cardinality(v.paid_users) > 0;
end;
$$;

revoke execute on function prune_expired_paid_users() from anon, authenticated;

-- Schedule nightly at 04:10 UTC. If pg_cron is unavailable, this block no-ops
-- with a notice; the human then schedules it via Supabase dashboard → Database → Cron.
do $$ begin
  perform cron.schedule('prune-expired-paid-users', '10 4 * * *', 'select prune_expired_paid_users()');
exception when others then
  raise notice 'pg_cron unavailable; schedule prune_expired_paid_users() manually';
end $$;
