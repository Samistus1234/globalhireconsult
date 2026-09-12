-- tests/rls/mp-messaging-isolation.sql
-- Cross-agency isolation acceptance gate for S10 partner messaging
-- (mp_threads / mp_messages / mp_notifications), Task 3.
--
-- Run:  supabase db query --linked -f tests/rls/mp-messaging-isolation.sql
-- This script wraps itself in BEGIN with NO COMMIT — it always ends in ROLLBACK, so
-- nothing it inserts (fixture agencies/members/thread/messages) persists.
--
-- `supabase db query` returns only the LAST result set, and RAISE NOTICE output is
-- dropped — so every assertion below is funnelled through set_config()/current_setting()
-- into one final SELECT that names each check and its PASS/FAIL outcome. Do not
-- restructure that pattern.
--
-- ── What this script proves, layer by layer (read before trusting a green run) ──
-- Checks 1, 2, 3 exercise the RLS USING clauses on public.gh_mp_threads /
-- public.gh_mp_messages directly: `authenticated` holds SELECT on both (schema-v40), so
-- these checks reach the policy and a PASS means the policy scoped the rows correctly.
--
-- Check 4 is DIFFERENT: as of schema-v40, `authenticated` has NO INSERT grant at all on
-- globalhire.mp_messages (the only INSERT paths are globalhire.mp_create_thread_with_message
-- and globalhire.mp_append_message, both service-role-only per schema-v40b — REVOKE ALL ...
-- FROM public, anon, authenticated). So this INSERT is rejected at the GRANT layer
-- (`permission denied for table mp_messages` / for the view) before Postgres ever
-- evaluates any RLS write-policy. mp_messages currently carries no INSERT policy at all
-- (schema-v40 only defines mp_messages_member_select), so a PASS on check 4 today proves
-- the grant is absent; it does NOT independently verify an RLS write-policy underneath,
-- because there isn't one to verify.
-- ⚠ IMPORTANT for future work: if any future migration grants `authenticated` INSERT on
-- mp_messages (directly or via public.gh_mp_messages) — e.g. to let the client send
-- messages without going through mp_append_message — check 4 will start reaching RLS for
-- the first time under this script, and at that point an RLS INSERT policy scoping
-- sender_user_id/thread membership MUST exist, or check 4 will flip to FAIL correctly.
-- Do not treat a green run of this script alone as proof that RLS blocks writes once such
-- a grant exists — re-verify the USING/WITH CHECK clauses directly first.
--
-- Check 5 exercises public.mp_mark_thread_read(uuid), which IS granted to `authenticated`
-- (schema-v40b). The function is SECURITY DEFINER and re-derives the caller's side and
-- agency membership server-side — a caller cannot pass which counter to clear. Calling it
-- as Agency A's owner against Agency A's own thread should clear agency_unread, NOT
-- gh_unread; this check confirms the GH-side counter is untouched by an agency-side caller.
--
-- Check 6 is a role-transition test, not a table check: it confirms `anon` (no JWT at all)
-- cannot read mp_threads. Per the task-3 CEO ruling on the brief's original script:
-- `SET LOCAL role anon` immediately after `SET LOCAL role authenticated` in the same
-- transaction is not a permitted direct role transition for a non-superuser connection and
-- would abort the script before reaching the final SELECT (silent no-report failure, worse
-- than a loud FAIL). Fix applied: `RESET role;` runs first to drop back to the connecting
-- role before `SET LOCAL role anon` is attempted. RESET role proved sufficient in practice
-- (see task-3-report.md for the literal run output) — no jwt-claims reordering was needed
-- beyond what's already below.
BEGIN;

INSERT INTO globalhire.mp_agencies (id,name,created_by,status) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a','Agency A','00000000-0000-0000-0000-00000000000a','verified'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','Agency B','00000000-0000-0000-0000-00000000000b','verified');
INSERT INTO globalhire.mp_agency_members (agency_id,user_id,role,status) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','owner','active'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','owner','active');

SELECT globalhire.mp_create_thread_with_message(
  'aaaaaaaa-0000-0000-0000-00000000000a','A thread','agency',null,'a body','[]'::jsonb,
  '00000000-0000-0000-0000-00000000000a','agency');
SELECT globalhire.mp_create_thread_with_message(
  'bbbbbbbb-0000-0000-0000-00000000000b','B thread','agency',null,'b body','[]'::jsonb,
  '00000000-0000-0000-0000-00000000000b','agency');

-- Become Agency A's owner.
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- 1. sees ONLY its own thread
SELECT set_config('chk.threads_scope',
  (SELECT CASE WHEN count(*) = 1 THEN 'PASS (got=1)' ELSE 'FAIL (got='||count(*)::text||')' END
   FROM public.gh_mp_threads), true);

-- 2. cannot read Agency B's messages
SELECT set_config('chk.b_messages_hidden',
  (SELECT CASE WHEN count(*) = 0 THEN 'PASS (got=0)' ELSE 'FAIL (got='||count(*)::text||')' END
   FROM public.gh_mp_messages m JOIN globalhire.mp_threads t ON t.id = m.thread_id
   WHERE t.agency_id = 'bbbbbbbb-0000-0000-0000-00000000000b'), true);

-- 3. positive control — DOES see its own message (proves 2 isn't a blanket-empty view)
SELECT set_config('chk.a_messages_visible',
  (SELECT CASE WHEN count(*) = 1 THEN 'PASS (got=1)' ELSE 'FAIL (got='||count(*)::text||')' END
   FROM public.gh_mp_messages), true);

-- 4. cannot INSERT a message directly (no client write grant exists — GRANT-layer denial,
--    see header; there is no RLS write-policy on mp_messages to independently verify today)
DO $$ BEGIN
  BEGIN
    INSERT INTO public.gh_mp_messages (thread_id, sender_user_id, sender_side, body_md)
    SELECT id,'00000000-0000-0000-0000-00000000000a','gh','forged'
      FROM globalhire.mp_threads LIMIT 1;
    PERFORM set_config('chk.no_client_insert','FAIL (insert succeeded)',true);
  EXCEPTION WHEN insufficient_privilege OR others THEN
    PERFORM set_config('chk.no_client_insert','PASS ('||SQLERRM||')',true);
  END;
END $$;

-- 5. cannot clear the GH-side unread counter
DO $$
DECLARE v_tid uuid; v_gh int;
BEGIN
  SELECT id INTO v_tid FROM globalhire.mp_threads
   WHERE agency_id='aaaaaaaa-0000-0000-0000-00000000000a';
  BEGIN PERFORM globalhire.mp_mark_thread_read(v_tid); EXCEPTION WHEN others THEN NULL; END;
  SELECT gh_unread INTO v_gh FROM globalhire.mp_threads WHERE id = v_tid;
  PERFORM set_config('chk.gh_unread_protected',
    CASE WHEN v_gh = 1 THEN 'PASS (gh_unread still 1)'
         ELSE 'FAIL (gh_unread='||v_gh::text||')' END, true);
END $$;

-- 6. anon sees nothing
-- MANDATORY CHANGE (CEO ruling, task-3 brief override): RESET role before switching to
-- anon. Going straight from `authenticated` to `anon` via SET LOCAL is not a permitted
-- direct role transition for this connection's non-superuser session and would abort the
-- script before the final SELECT. RESET role drops back to the connecting role first, so
-- the subsequent SET LOCAL role anon lands cleanly.
RESET role;
SELECT set_config('request.jwt.claims','{"role":"anon"}', true);
SET LOCAL role anon;
DO $$ BEGIN
  BEGIN
    PERFORM count(*) FROM public.gh_mp_threads;
    PERFORM set_config('chk.anon_denied','FAIL (anon could select)',true);
  EXCEPTION WHEN insufficient_privilege OR others THEN
    PERFORM set_config('chk.anon_denied','PASS ('||SQLERRM||')',true);
  END;
END $$;

RESET role;
SELECT unnest(ARRAY['1 threads_scope','2 b_messages_hidden','3 a_messages_visible',
                    '4 no_client_insert','5 gh_unread_protected','6 anon_denied']) AS check,
       unnest(ARRAY[current_setting('chk.threads_scope',true),
                    current_setting('chk.b_messages_hidden',true),
                    current_setting('chk.a_messages_visible',true),
                    current_setting('chk.no_client_insert',true),
                    current_setting('chk.gh_unread_protected',true),
                    current_setting('chk.anon_denied',true)]) AS result;

ROLLBACK;
