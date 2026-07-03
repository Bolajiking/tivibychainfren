-- CRITICAL FIX. The service-role key is the trusted server identity used by
-- every money/creator write route (it bypasses RLS and never reaches the
-- browser). These app tables were missing the Supabase-default
-- `grant all ... to service_role`, so `.from(...).insert/upsert/update` failed
-- with "permission denied for table ..." — while SECURITY DEFINER RPCs
-- (redeem_creator_invite, append_paid_user, decrement_inventory) kept working
-- because they run as the function owner, masking the gap.
--
-- Symptom: POST /api/profile (and any service-role table write) returned 500
-- profile_write_failed even though the row was valid.
--
-- Restore service_role's full table/sequence access and set it as the default
-- for future tables. RLS still scopes anon/authenticated; service_role is
-- intentionally privileged and server-only.

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
