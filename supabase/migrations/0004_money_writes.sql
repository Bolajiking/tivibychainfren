-- TVinBio — server-side money-write helpers. Called only by the settle route via
-- the service-role key (which bypasses RLS); not granted to anon/authenticated.

-- Append a wallet to a resource's paid_users[] (idempotent).
create or replace function append_paid_user(p_kind text, p_id text, p_wallet text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare w text := lower(p_wallet);
begin
  if p_kind = 'video' then
    update videos
      set paid_users = (select array(select distinct unnest(paid_users || array[w])))
      where playback_id = p_id;
  else
    update streams
      set paid_users = (select array(select distinct unnest(paid_users || array[w])))
      where playback_id = p_id;
  end if;
end;
$$;

-- Decrement product inventory; flip to sold_out at zero.
create or replace function decrement_inventory(p_product_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update products
    set inventory = greatest(0, inventory - 1),
        status = case when greatest(0, inventory - 1) = 0 then 'sold_out'::product_status else status end
    where id = p_product_id;
end;
$$;

revoke execute on function append_paid_user(text, text, text) from anon, authenticated;
revoke execute on function decrement_inventory(text) from anon, authenticated;
