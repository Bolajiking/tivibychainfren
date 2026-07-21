-- 0017: Chat posting requires sign-in (D4).
-- All chat writes now go through the authenticated POST /api/chats route
-- (service-role, which bypasses RLS). Anonymous/authenticated clients keep
-- READ access for realtime, but lose direct INSERT and DELETE.

drop policy if exists p_insert on chats;
drop policy if exists p_delete on chats;
revoke insert, delete on chats from anon, authenticated;
