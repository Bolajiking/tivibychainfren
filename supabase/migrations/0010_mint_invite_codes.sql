-- TVinBio — invite-code minting (admin). The table + redemption gate already
-- exist (0001 creator_invite_codes, 0002 redeem_creator_invite / has_creator_access).
-- This adds an admin minting helper that generates unique, human-typable codes.
-- SECURITY DEFINER and revoked from anon/authenticated → only the service-role
-- (server / admin tooling) can mint. Pass p_max_uses=0 for an unlimited code.
--
-- Usage (service-role):  select mint_invite_codes(10, 1);   -- 10 single-use codes

create or replace function mint_invite_codes(p_count int default 1, p_max_uses int default 1)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare i int; v_code text;
begin
  for i in 1..greatest(1, p_count) loop
    loop
      v_code := 'TVIN-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      exit when not exists (select 1 from creator_invite_codes where code = v_code);
    end loop;
    insert into creator_invite_codes(code, is_active, max_uses) values (v_code, true, nullif(p_max_uses, 0));
    return next v_code;
  end loop;
end;
$$;

revoke all on function mint_invite_codes(int, int) from public, anon, authenticated;
