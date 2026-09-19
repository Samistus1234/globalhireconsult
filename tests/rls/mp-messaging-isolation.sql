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
-- Check 1 asserts on IDENTITY, not cardinality: array_agg(subject) = ARRAY['A thread'],
-- not count(*) = 1 — a bug that swapped which thread Agency A sees (wrong row, still one
-- row) would pass a count-only check and must fail this one.
--
-- Check 2 deliberately does NOT join to globalhire.mp_threads. mp_threads has RLS enabled,
-- so a join on it would silently scope the result to Agency A's own threads regardless of
-- what mp_messages' own policy does — a join-based version of this check is vacuous (it
-- re-proves check 1, not mp_messages' policy). Instead, Agency B's thread id is captured
-- into fx.b_thread_id BEFORE the role switch (while still running with full/elevated
-- rights), and check 2 filters public.gh_mp_messages by that literal uuid with no join at
-- all — so ONLY mp_messages_member_select decides the result. If that policy were ever
-- `USING (true)`, check 2 would report got=1 (Agency B's message) and correctly FAIL.
--
-- Check 3 is a whole-table leakage detector, not a "positive control for check 2": it runs
-- gh_mp_messages with no WHERE clause at all. Exactly one row exists across both agencies'
-- fixtures at this point in the transaction; count(*) = 1 confirms only Agency A's own
-- message is visible. If the message policy leaked cross-agency, this would report got=2,
-- not got=0 — the important number here is 1, distinguishing "policy scopes correctly"
-- from either "denies everything" (check 2 could look like a false PASS on its own) or
-- "leaks everything".
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
-- as Agency A's owner against Agency A's own thread should succeed (Agency A does own the
-- thread) and clear agency_unread, NOT gh_unread. The check reads gh_unread BEFORE the
-- call (asserting the fixture precondition really is 1, not assuming it), calls the RPC
-- without swallowing its outcome, and only then reads gh_unread again — a delta, not a
-- guess. If the RPC throws for any reason that is a FAIL with the real SQLERRM (an
-- exception here is not the escalation being tested and must not be silently read as a
-- refusal); a PASS requires the call to succeed AND gh_unread to still read 1 afterward.
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

-- Capture Agency B's thread id now, while still running elevated, so check 2 can query
-- mp_messages directly by literal thread_id with no join back through mp_threads.
SELECT set_config('fx.b_thread_id',
  (SELECT id::text FROM globalhire.mp_threads WHERE agency_id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
  true);

-- Become Agency A's owner.
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- 1. sees ONLY its own thread — identity, not just cardinality
SELECT set_config('chk.threads_scope',
  (SELECT CASE WHEN array_agg(subject ORDER BY subject) = ARRAY['A thread']
          THEN 'PASS (got=' || array_agg(subject ORDER BY subject)::text || ')'
          ELSE 'FAIL (got=' || COALESCE(array_agg(subject ORDER BY subject)::text, 'NULL') || ')' END
   FROM public.gh_mp_threads), true);

-- 2. cannot read Agency B's messages — filtered directly by B's thread_id, NO join to
--    mp_threads (see header: a join would make this vacuous, since mp_threads' own RLS
--    would silently scope it for us regardless of mp_messages' policy).
SELECT set_config('chk.b_messages_hidden',
  (SELECT CASE WHEN count(*) = 0 THEN 'PASS (got=0)' ELSE 'FAIL (got='||count(*)::text||')' END
   FROM public.gh_mp_messages
   WHERE thread_id = current_setting('fx.b_thread_id')::uuid), true);

-- 3. whole-table leakage detector (see header) — not a "positive control for check 2"
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
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      PERFORM set_config('chk.no_client_insert','PASS ('||SQLERRM||')',true);
    ELSE
      PERFORM set_config('chk.no_client_insert',
        'FAIL (unexpected SQLSTATE='||SQLSTATE||': '||SQLERRM||')',true);
    END IF;
  END;
END $$;

-- 5. cannot clear the GH-side unread counter
DO $$
DECLARE
  v_tid       uuid;
  v_gh_before int;
  v_gh_after  int;
  v_call_ok   boolean := true;
  v_errmsg    text;
BEGIN
  SELECT id INTO v_tid FROM globalhire.mp_threads
   WHERE agency_id='aaaaaaaa-0000-0000-0000-00000000000a';

  -- Precondition, not an assumption: the fixture's insert trigger must have already set
  -- gh_unread=1, or a "still 1" reading after the call proves nothing.
  SELECT gh_unread INTO v_gh_before FROM globalhire.mp_threads WHERE id = v_tid;
  IF v_gh_before IS DISTINCT FROM 1 THEN
    PERFORM set_config('chk.gh_unread_protected',
      'FAIL (fixture precondition broken: gh_unread_before='
        ||COALESCE(v_gh_before::text,'NULL')||', expected 1)', true);
    RETURN;
  END IF;

  BEGIN
    PERFORM globalhire.mp_mark_thread_read(v_tid);
  EXCEPTION WHEN OTHERS THEN
    v_call_ok := false;
    v_errmsg := SQLERRM;
  END;

  SELECT gh_unread INTO v_gh_after FROM globalhire.mp_threads WHERE id = v_tid;

  -- The property under test is "an agency-side actor cannot clear gh_unread" — that
  -- requires the legitimate call to actually run (Agency A DOES own this thread, so a
  -- throw here is a different failure, not a passing refusal) AND gh_unread to be
  -- unchanged afterward. Swallowing the exception and only checking "still 1" would let
  -- an RPC that throws for an unrelated reason report a false PASS.
  IF NOT v_call_ok THEN
    PERFORM set_config('chk.gh_unread_protected',
      'FAIL (mp_mark_thread_read raised: '||v_errmsg||')', true);
  ELSIF v_gh_after = 1 THEN
    PERFORM set_config('chk.gh_unread_protected',
      'PASS (call succeeded, gh_unread stayed 1)', true);
  ELSE
    PERFORM set_config('chk.gh_unread_protected',
      'FAIL (gh_unread='||v_gh_after::text||')', true);
  END IF;
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
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      PERFORM set_config('chk.anon_denied','PASS ('||SQLERRM||')',true);
    ELSE
      PERFORM set_config('chk.anon_denied',
        'FAIL (unexpected SQLSTATE='||SQLSTATE||': '||SQLERRM||')',true);
    END IF;
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
