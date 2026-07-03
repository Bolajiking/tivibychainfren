-- TVinBio — close a critical privilege hole.
-- Postgres grants EXECUTE on every function to PUBLIC by default. Migration 0004
-- revoked the money-write RPCs from `anon` and `authenticated`, but NOT from
-- PUBLIC — and anon/authenticated are members of PUBLIC, so they could still
-- call them via PostgREST (/rest/v1/rpc/...). That let any client invoke
-- `append_paid_user` to grant itself access to any gated stream/video without
-- paying, and `decrement_inventory` to corrupt stock — bypassing the entire
-- on-chain settle trust gate.
--
-- Revoke from PUBLIC (the real fix) and re-grant only to service_role, which is
-- what the settle route uses. rls_auto_enable is a maintenance helper that was
-- never meant to be client-callable either.

revoke execute on function append_paid_user(text, text, text) from public, anon, authenticated;
revoke execute on function decrement_inventory(text) from public, anon, authenticated;

grant execute on function append_paid_user(text, text, text) to service_role;
grant execute on function decrement_inventory(text) to service_role;

do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- has_creator_access and redeem_creator_invite stay anon-callable on purpose:
-- they are the invite-gated onboarding entry points.
