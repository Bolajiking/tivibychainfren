-- TVinBio — race-safe subscriber count increment for paid monthly subs.

create or replace function increment_subscriber_count(p_creator_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update creators
    set subscriber_count = subscriber_count + 1
    where creator_id = lower(p_creator_id);
$$;

revoke execute on function increment_subscriber_count(text) from public, anon, authenticated;
grant execute on function increment_subscriber_count(text) to service_role;
