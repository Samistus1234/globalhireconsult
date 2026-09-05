-- tests/rls/mp-isolation.sql
-- Cross-agency isolation acceptance gate for the Partner Marketplace tenancy layer
-- (Chunk 1, Task 15 / Part B). Covers every mp_* table now in existence:
--   mp_agencies, mp_agency_members, mp_agency_invites, mp_ai_runs.
--
-- Run:  supabase db query --linked -f tests/rls/mp-isolation.sql
-- This script wraps itself in BEGIN with NO COMMIT — it always ends in ROLLBACK, so
-- nothing it inserts (fixture agencies/members/invites/ai_runs) persists.
--
-- `supabase db query` returns only the LAST result set, and RAISE NOTICE output is
-- dropped — so every assertion below is funnelled through set_config()/current_setting()
-- into one final SELECT that names each check and its PASS/FAIL outcome.
--
-- Re-run this script (unmodified, or extended with new mp_* tables) as the acceptance
-- gate for every later chunk that adds an mp_* table.
BEGIN;

-- Two synthetic users, two synthetic agencies (each owned by one of them), one invite
-- per agency, and one mp_ai_runs row — inserted here as the connecting (superuser/owner)
-- role, which bypasses RLS.
INSERT INTO globalhire.mp_agencies (id, name, status, created_by)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Agency A', 'verified', '00000000-0000-0000-0000-00000000000a'),
       ('bbbbbbbb-0000-0000-0000-000000000002', 'Agency B', 'verified', '00000000-0000-0000-0000-00000000000b');

INSERT INTO globalhire.mp_agency_members (agency_id, user_id, role, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner', 'active'),
       ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'owner', 'active');

INSERT INTO globalhire.mp_agency_invites (agency_id, email, role, token, invited_by, expires_at)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'x@a.com', 'member', 'rls-iso-test-tok-a', '00000000-0000-0000-0000-00000000000a', now() + interval '7 days'),
       ('bbbbbbbb-0000-0000-0000-000000000002', 'x@b.com', 'member', 'rls-iso-test-tok-b', '00000000-0000-0000-0000-00000000000b', now() + interval '7 days');

INSERT INTO globalhire.mp_ai_runs (feature, agency_id, model, status)
VALUES ('match', 'aaaaaaaa-0000-0000-0000-000000000001', 'claude-sonnet-4-20250514', 'ok');

-- Act as userA (owner of Agency A, no relation to Agency B)
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 1. sees only Agency A (not Agency B) through the agencies view
SELECT set_config('chk.agencies_visible',
  (SELECT CASE WHEN array_agg(name ORDER BY name) = ARRAY['Agency A']
          THEN 'PASS (got=' || array_agg(name ORDER BY name)::text || ')'
          ELSE 'FAIL (got=' || COALESCE(array_agg(name ORDER BY name)::text, 'NULL') || ')' END
   FROM public.gh_mp_agencies), true);

-- 2. cannot read Agency B's members
SELECT set_config('chk.b_members_hidden',
  (SELECT CASE WHEN count(*) = 0 THEN 'PASS (got=0)' ELSE 'FAIL (got=' || count(*)::text || ')' END
   FROM public.gh_mp_agency_members WHERE agency_id = 'bbbbbbbb-0000-0000-0000-000000000002'), true);

-- 3. sees Agency A's own members (positive control — proves check 2 isn't a blanket-empty view)
SELECT set_config('chk.a_members_visible',
  (SELECT CASE WHEN count(*) = 1 THEN 'PASS (got=1)' ELSE 'FAIL (got=' || count(*)::text || ')' END
   FROM public.gh_mp_agency_members WHERE agency_id = 'aaaaaaaa-0000-0000-0000-000000000001'), true);

-- 4. invites: sees only Agency A's invite, not Agency B's
SELECT set_config('chk.invites_scope',
  (SELECT CASE WHEN count(*) = 1 THEN 'PASS (got=1)' ELSE 'FAIL (got=' || count(*)::text || ')' END
   FROM public.gh_mp_agency_invites), true);

-- 5. mp_ai_runs: admin-only — a non-admin agency owner sees nothing, even for their own agency
SELECT set_config('chk.ai_runs_hidden',
  (SELECT CASE WHEN count(*) = 0 THEN 'PASS (got=0)' ELSE 'FAIL (got=' || count(*)::text || ')' END
   FROM public.gh_mp_ai_runs), true);

-- 6. cannot UPDATE another agency (grant allows the statement; RLS filters it to 0 rows —
--    no error, just nothing touched)
WITH upd AS (
  UPDATE public.gh_mp_agencies SET status = 'suspended'
  WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
  RETURNING 1
)
SELECT set_config('chk.cross_agency_update_denied',
  (SELECT CASE WHEN count(*) = 0 THEN 'PASS (rows_affected=0)' ELSE 'FAIL (rows_affected=' || count(*)::text || ')' END
   FROM upd), true);

-- 7. cannot flip own agency's protected columns — mp_agencies_column_guard trigger blocks
--    a non-admin actually changing a protected column on their own agency (grant + RLS
--    both allow the UPDATE to reach the row; the trigger is what denies it). Agency A's
--    fixture status is 'verified', so the attempted value here MUST differ from that —
--    the trigger only fires on IS DISTINCT FROM, so re-asserting the same value is a
--    no-op that proves nothing.
DO $$
BEGIN
  UPDATE globalhire.mp_agencies SET status = 'suspended'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  PERFORM set_config('chk.own_column_guard', 'FAIL (update was allowed)', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('chk.own_column_guard', 'PASS (' || SQLERRM || ')', true);
END $$;

-- 8. cannot INSERT a membership into another agency (self-join escalation — blocked by the
--    schema-v35 grant revocation before RLS is even reached)
DO $$
BEGIN
  INSERT INTO globalhire.mp_agency_members (agency_id, user_id, role, status)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'member', 'active');
  PERFORM set_config('chk.cross_agency_membership_insert_denied', 'FAIL (insert was allowed)', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('chk.cross_agency_membership_insert_denied', 'PASS (' || SQLERRM || ')', true);
END $$;

-- 9. cannot forge a brand-new invite for another agency
DO $$
BEGIN
  INSERT INTO globalhire.mp_agency_invites (agency_id, email, role, token, invited_by, expires_at)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'forged@x.com', 'admin', 'rls-iso-test-tok-forged',
          '00000000-0000-0000-0000-00000000000a', now() + interval '7 days');
  PERFORM set_config('chk.invite_forge_denied', 'FAIL (forged insert was allowed)', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('chk.invite_forge_denied', 'PASS (' || SQLERRM || ')', true);
END $$;

-- 10. cannot hijack another agency's invite via a direct write (bypassing the
--     mp-agency-invite-accept edge function's own-email check)
DO $$
BEGIN
  UPDATE globalhire.mp_agency_invites SET status = 'accepted', accepted_user_id = '00000000-0000-0000-0000-00000000000a'
  WHERE token = 'rls-iso-test-tok-b';
  PERFORM set_config('chk.invite_hijack_denied', 'FAIL (hijack update was allowed)', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('chk.invite_hijack_denied', 'PASS (' || SQLERRM || ')', true);
END $$;

-- 11. cannot self-register a verified agency directly, bypassing mp-agency-register
DO $$
BEGIN
  INSERT INTO globalhire.mp_agencies (name, status, created_by)
  VALUES ('Forged Agency', 'verified', '00000000-0000-0000-0000-00000000000a');
  PERFORM set_config('chk.agency_self_insert_denied', 'FAIL (direct agency insert was allowed)', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('chk.agency_self_insert_denied', 'PASS (' || SQLERRM || ')', true);
END $$;

RESET role;

-- Consolidated result — every row must read PASS.
SELECT * FROM (VALUES
  ('1_agencies_visible',                current_setting('chk.agencies_visible', true)),
  ('2_b_members_hidden',                current_setting('chk.b_members_hidden', true)),
  ('3_a_members_visible',               current_setting('chk.a_members_visible', true)),
  ('4_invites_scope',                   current_setting('chk.invites_scope', true)),
  ('5_ai_runs_hidden',                  current_setting('chk.ai_runs_hidden', true)),
  ('6_cross_agency_update_denied',      current_setting('chk.cross_agency_update_denied', true)),
  ('7_own_protected_column_guard',      current_setting('chk.own_column_guard', true)),
  ('8_cross_agency_membership_insert',  current_setting('chk.cross_agency_membership_insert_denied', true)),
  ('9_invite_forge_denied',             current_setting('chk.invite_forge_denied', true)),
  ('10_invite_hijack_denied',           current_setting('chk.invite_hijack_denied', true)),
  ('11_agency_self_insert_denied',      current_setting('chk.agency_self_insert_denied', true))
) AS t(check_name, result)
ORDER BY 1;

ROLLBACK;
