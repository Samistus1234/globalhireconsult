-- schema-v40c-mp-messaging-grants-fix.sql
-- Fix: mp_create_thread_with_message / mp_append_message are documented
-- "Service-role only" (schema-v40b) but the REVOKE ALL ... FROM public, anon,
-- authenticated in v40b also strips the *implicit* PUBLIC execute grant that
-- service_role relied on -- service_role was never given an EXPLICIT grant.
-- Result: mp-thread-create and mp-thread-post (both call these RPCs through
-- the service-role PostgREST client) return
--   "permission denied for function mp_create_thread_with_message" / "...mp_append_message"
-- for EVERY caller, admin or agency -- confirmed live via `SET ROLE service_role`
-- during Task 15's production round-trip smoke test, 2026-09-13.
-- This is additive only: grants EXECUTE to service_role, the one role these
-- functions were always meant to run as. No grant to authenticated/anon/public
-- is added -- the "service-role only" design in v40b is preserved and is still
-- what tests/rls/mp-messaging-isolation.sql and tests/rls/mp-isolation.sql exercise.
BEGIN;

GRANT EXECUTE ON FUNCTION globalhire.mp_create_thread_with_message(uuid,text,text,uuid,text,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION globalhire.mp_append_message(uuid,text,jsonb,uuid,text) TO service_role;

COMMIT;
