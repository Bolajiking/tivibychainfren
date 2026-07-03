-- TVinBio — RLS policies, realtime publication, invite RPCs.
-- Model: public surface is read-only via the anon key. All mutations that move
-- money or grant access go through server routes using the service-role key
-- (which bypasses RLS). Live chat insert is the one anon write we allow.

-- ── Enable RLS ──────────────────────────────────────────────────────
alter table creators            enable row level security;
alter table streams             enable row level security;
alter table videos              enable row level security;
alter table products            enable row level security;
alter table featured_products   enable row level security;
alter table chats               enable row level security;
alter table subscriptions       enable row level security;
alter table orders              enable row level security;
alter table notifications       enable row level security;
alter table creator_invite_codes  enable row level security;
alter table creator_access_grants enable row level security;

-- ── Public read (anon) on the viewer surface ────────────────────────
drop policy if exists p_read on creators;
create policy p_read on creators for select using (true);
drop policy if exists p_read on streams;
create policy p_read on streams for select using (true);
drop policy if exists p_read on videos;
create policy p_read on videos for select using (true);
drop policy if exists p_read on products;
create policy p_read on products for select using (true);
drop policy if exists p_read on featured_products;
create policy p_read on featured_products for select using (true);
drop policy if exists p_read on chats;
create policy p_read on chats for select using (true);
drop policy if exists p_read on subscriptions;
create policy p_read on subscriptions for select using (true);

-- ── Live chat: anon may post and (for moderation) delete ────────────
-- Tighten to wallet-claim policies once auth-claim JWTs are wired.
drop policy if exists p_insert on chats;
create policy p_insert on chats for insert with check (true);
drop policy if exists p_delete on chats;
create policy p_delete on chats for delete using (true);

-- subscriptions / orders / notifications: NO anon write policy.
-- Service-role server routes own those writes (bypass RLS). Invite tables
-- have RLS on with zero policies → all anon/auth access denied; reach them
-- only through the SECURITY DEFINER RPCs below.

-- ── Realtime publication ────────────────────────────────────────────
-- chats (live messages), featured_products (live-shopping pins),
-- streams (is_active live/offline flips).
do $$ begin
  alter publication supabase_realtime add table chats;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table featured_products;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table streams;
exception when duplicate_object then null; end $$;

-- ── Invite RPCs (SECURITY DEFINER, row-locked) ──────────────────────
create or replace function has_creator_access(p_creator_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from creator_access_grants
    where creator_id = lower(p_creator_id)
  );
$$;

create or replace function redeem_creator_invite(p_creator_id text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code creator_invite_codes%rowtype;
  v_creator text := lower(p_creator_id);
  v_input  text := upper(trim(p_code));
begin
  if exists (select 1 from creator_access_grants where creator_id = v_creator) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select * into v_code from creator_invite_codes
    where code = v_input for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  if not v_code.is_active then
    return jsonb_build_object('ok', false, 'error', 'inactive');
  end if;
  if v_code.expires_at is not null and v_code.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_code.max_uses is not null and v_code.used_count >= v_code.max_uses then
    return jsonb_build_object('ok', false, 'error', 'exhausted');
  end if;

  insert into creator_access_grants(creator_id, invite_code)
    values (v_creator, v_code.code);
  update creator_invite_codes set used_count = used_count + 1
    where id = v_code.id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function has_creator_access(text) to anon, authenticated;
grant execute on function redeem_creator_invite(text, text) to anon, authenticated;
