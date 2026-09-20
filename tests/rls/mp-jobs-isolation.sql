-- tests/rls/mp-jobs-isolation.sql
-- Cross-role isolation acceptance gate for the Partner Marketplace job board
-- (Chunk 2A, Task 2). Covers globalhire.mp_jobs / public.gh_mp_jobs.
--
-- Run:  supabase db query --linked -f tests/rls/mp-jobs-isolation.sql
-- This script wraps itself in BEGIN with NO COMMIT — it always ends in ROLLBACK, so
-- nothing it inserts (fixture agencies/members/jobs) persists.
--
-- `supabase db query` returns only the LAST result set, and RAISE NOTICE output is
-- dropped — so every assertion below is funnelled through set_config()/current_setting()
-- into one final SELECT that names each check and its PASS/FAIL outcome. Do not
-- restructure that pattern.
--
-- ── Jobs are NOT agency-scoped — read this before touching the fixtures ──
-- Every other mp_* table (mp_agencies, mp_agency_members, mp_agency_invites, mp_ai_runs,
-- mp_threads, mp_messages) is tenancy-scoped: a row belongs to exactly one agency, and the
-- RLS predicate is "is the caller a member of THAT agency". mp_jobs has no agency_id at
-- all — the job board is GlobalHire's own inventory, browsed by any verified partner.
-- The predicate (schema-v42) is instead: an admin sees everything, and any authenticated
-- caller who is an ACTIVE member of *some* agency (globalhire.my_agency_ids() non-empty)
-- sees jobs with status = 'open', regardless of which agency that is. Agency B below
-- exists only as fixture flavour matching the brief ("two agencies... B irrelevant") — no
-- check depends on which agency the partner belongs to, and none should ever be written
-- that assumes an agency_id column on mp_jobs.
--
-- ── Positive controls — every "sees nothing" / "is hidden" assertion is paired ──
-- A predecessor branch shipped a check that joined an RLS-protected table, so its
-- count = 0 was guaranteed regardless of whether the policy under test was correct or
-- wide open (`USING (true)` would have passed it too) — caught only in a late review.
-- So here: check 2 (draft hidden) carries a positive control in the SAME query shape
-- against the open job's id; check 3 (confidential masked) carries a positive control in
-- the same query shape against the non-confidential open job. Check 4 (admin sees
-- everything, unmasked) is itself the positive control proving checks 1-3 are the RLS
-- policy actually filtering/masking, not the view or the fixture being vacuously empty.
--
-- ── What this script proves, layer by layer (read before trusting a green run) ──
-- Checks 1-4 are SELECTs. `authenticated` holds SELECT on both globalhire.mp_jobs and
-- public.gh_mp_jobs (schema-v42 GRANT), so these checks reach RLS and a PASS means the
-- mp_jobs_partner_open_select / mp_jobs_admin_all policies (and the view's masking CASE)
-- are doing the filtering — not an absent grant.
--
-- Check 5 is DIFFERENT: schema-v42 grants `authenticated` SELECT ONLY on both
-- globalhire.mp_jobs and public.gh_mp_jobs — there is no INSERT grant at all, and no
-- RLS INSERT/WITH CHECK policy exists on mp_jobs for a non-admin caller. So this INSERT is
-- rejected at the GRANT layer ("permission denied for view gh_mp_jobs") before Postgres
-- ever evaluates RLS. A PASS on check 5 proves the grant is absent; it does NOT
-- independently verify an RLS write-policy underneath, because there isn't one to verify
-- for partners. ⚠ If any future migration grants `authenticated` INSERT on mp_jobs or the
-- view (e.g. to let agencies submit their own postings — explicitly out of scope for
-- Phase 1), check 5 will start reaching RLS for the first time under this script, and at
-- that point an RLS WITH CHECK policy must exist to deny it, or check 5 will correctly
-- flip to FAIL. Do not treat a green run of this script alone as proof RLS blocks writes
-- once such a grant exists.
--
-- Check 6 is a role-transition test: `anon` (no JWT at all) cannot read mp_jobs. Per the
-- precedent set in tests/rls/mp-messaging-isolation.sql, `SET LOCAL role anon` directly
-- after `SET LOCAL role authenticated` in the same transaction is not a permitted direct
-- role transition for this connection's non-superuser session and aborts the script before
-- the final SELECT — a silent no-report failure, worse than a loud FAIL. Fix applied:
-- `RESET role;` runs first to drop back to the connecting role before `SET LOCAL role
-- anon` is attempted.
--
-- ── Why the admin actor is a real profiles row, not a synthetic uuid ──
-- globalhire.is_admin() reads role from globalhire.profiles WHERE id = auth.uid(), and
-- globalhire.profiles.id carries a live FOREIGN KEY to auth.users(id). Every other
-- synthetic actor in this script (the partner, the two agencies) needs no such row because
-- mp_agency_members.user_id and mp_jobs.posted_by carry no FK. Inserting a throwaway
-- auth.users row to back a synthetic admin would reach further into the schema than a
-- fixture that must roll back cleanly should go. Instead this script borrows the id of the
-- existing "E2E Test Admin" profiles row (role='admin', id=
-- 22edc9b1-3556-46df-b572-7c35f099947f) purely as a JWT `sub` for a read-only check inside
-- a transaction that always ends in ROLLBACK — no row belonging to that identity is read,
-- written, or modified; only the RLS-visible shape of mp_jobs is exercised through it.
BEGIN;

-- Two agencies. Agency A is verified with one active member (the partner actor for
-- checks 1, 2, 3, 5). Agency B is a fixture-flavour distractor only — no check below reads
-- from or depends on Agency B, deliberately, because mp_jobs has no agency_id (see header).
INSERT INTO globalhire.mp_agencies (id, name, status, created_by)
VALUES ('cccccccc-0000-0000-0000-00000000000a', 'Job-Gate Agency A', 'verified', '00000000-0000-0000-0000-0000000000c1'),
       ('dddddddd-0000-0000-0000-00000000000b', 'Job-Gate Agency B', 'pending_verification', '00000000-0000-0000-0000-0000000000c2');

INSERT INTO globalhire.mp_agency_members (agency_id, user_id, role, status)
VALUES ('cccccccc-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'owner', 'active');

-- Four jobs: one open/non-confidential, one open/confidential, one draft, one closed.
INSERT INTO globalhire.mp_jobs (id, title, employer_name, employer_confidential, status, posted_by)
VALUES
  ('0a000000-0000-0000-0000-000000000001', 'Staff Nurse — Open Public',       'PUBLIC CLINIC',  false, 'open',   '22edc9b1-3556-46df-b572-7c35f099947f'),
  ('0a000000-0000-0000-0000-000000000002', 'Staff Nurse — Open Confidential', 'SECRET HOSPITAL', true, 'open',   '22edc9b1-3556-46df-b572-7c35f099947f'),
  ('0a000000-0000-0000-0000-000000000003', 'Staff Nurse — Draft',             'DRAFT EMPLOYER', false, 'draft',  '22edc9b1-3556-46df-b572-7c35f099947f'),
  ('0a000000-0000-0000-0000-000000000004', 'Staff Nurse — Closed',            'CLOSED EMPLOYER',false, 'closed', '22edc9b1-3556-46df-b572-7c35f099947f');

-- Act as Agency A's member (a partner — not admin, not the agency's own posting workflow).
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

-- 1. partner_sees_only_open — sees exactly the 2 open jobs, not all 4.
SELECT set_config('chk.partner_sees_only_open',
  (SELECT CASE WHEN count(*) = 2 THEN 'PASS (got=2)' ELSE 'FAIL (got=' || count(*)::text || ')' END
   FROM public.gh_mp_jobs), true);

-- 2. partner_cannot_see_draft — the draft job is invisible by its literal id.
--    Positive control, same query shape: the open job's literal id DOES return a row —
--    proves the WHERE id = ... lookup itself works and isn't vacuously empty.
SELECT set_config('chk.partner_cannot_see_draft',
  (SELECT CASE
     WHEN draft_count = 0 AND open_positive_control = 1
     THEN 'PASS (draft=0, open_positive_control=1)'
     ELSE 'FAIL (draft=' || draft_count::text || ', open_positive_control=' || open_positive_control::text || ')'
   END
   FROM (
     SELECT
       (SELECT count(*) FROM public.gh_mp_jobs WHERE id = '0a000000-0000-0000-0000-000000000003') AS draft_count,
       (SELECT count(*) FROM public.gh_mp_jobs WHERE id = '0a000000-0000-0000-0000-000000000001') AS open_positive_control
   ) s), true);

-- 3. confidential_employer_masked — employer_name is NULL for the confidential job.
--    Positive control, same query shape: employer_name for the non-confidential open job
--    IS NOT NULL — proves the column itself is readable and the mask isn't a blanket NULL.
SELECT set_config('chk.confidential_employer_masked',
  (SELECT CASE
     WHEN confidential_name IS NULL AND public_positive_control IS NOT NULL
     THEN 'PASS (confidential=NULL, public_positive_control=' || public_positive_control || ')'
     ELSE 'FAIL (confidential=' || COALESCE(confidential_name, 'NULL') || ', public_positive_control=' || COALESCE(public_positive_control, 'NULL') || ')'
   END
   FROM (
     SELECT
       (SELECT employer_name FROM public.gh_mp_jobs WHERE id = '0a000000-0000-0000-0000-000000000002') AS confidential_name,
       (SELECT employer_name FROM public.gh_mp_jobs WHERE id = '0a000000-0000-0000-0000-000000000001') AS public_positive_control
   ) s), true);

-- Switch identity to a real admin profiles row (see header for why it's real, not
-- synthetic). Same `authenticated` role — only the JWT sub claim changes.
SET LOCAL request.jwt.claims = '{"sub":"22edc9b1-3556-46df-b572-7c35f099947f","role":"authenticated"}';

-- 4. admin_sees_all_and_unmasked — sees all 4 jobs (draft + closed included) AND the
--    confidential job's employer_name is unmasked. This is the positive control proving
--    checks 1-3 are the RLS policy/masking actually working, not a vacuously-empty view.
SELECT set_config('chk.admin_sees_all_and_unmasked',
  (SELECT CASE
     WHEN total_count = 4 AND confidential_name_admin IS NOT NULL
     THEN 'PASS (count=4, confidential_name=' || confidential_name_admin || ')'
     ELSE 'FAIL (count=' || total_count::text || ', confidential_name=' || COALESCE(confidential_name_admin, 'NULL') || ')'
   END
   FROM (
     SELECT
       (SELECT count(*) FROM public.gh_mp_jobs) AS total_count,
       (SELECT employer_name FROM public.gh_mp_jobs WHERE id = '0a000000-0000-0000-0000-000000000002') AS confidential_name_admin
   ) s), true);

-- Switch back to the partner actor for the write-denial check.
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

-- 5. partner_cannot_write — an INSERT into public.gh_mp_jobs as a partner is refused.
--    GRANT-layer denial today (see header) — SQLSTATE 42501 asserted explicitly, not a
--    bare WHEN OTHERS, so an unrelated error (e.g. a NOT NULL violation) cannot read as a
--    pass.
DO $$ BEGIN
  BEGIN
    INSERT INTO public.gh_mp_jobs (title, posted_by, status)
    VALUES ('Forged Partner-Posted Job', '00000000-0000-0000-0000-0000000000c1', 'open');
    PERFORM set_config('chk.partner_cannot_write', 'FAIL (insert succeeded)', true);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      PERFORM set_config('chk.partner_cannot_write', 'PASS (GRANT-layer denial: ' || SQLERRM || ')', true);
    ELSE
      PERFORM set_config('chk.partner_cannot_write',
        'FAIL (unexpected SQLSTATE=' || SQLSTATE || ': ' || SQLERRM || ')', true);
    END IF;
  END;
END $$;

-- 6. anon_denied — RESET role first (mandatory — see header), then anon cannot select at
--    all. SQLSTATE 42501 asserted explicitly.
RESET role;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL role anon;
DO $$ BEGIN
  BEGIN
    PERFORM count(*) FROM public.gh_mp_jobs;
    PERFORM set_config('chk.anon_denied', 'FAIL (anon could select)', true);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      PERFORM set_config('chk.anon_denied', 'PASS (' || SQLERRM || ')', true);
    ELSE
      PERFORM set_config('chk.anon_denied',
        'FAIL (unexpected SQLSTATE=' || SQLSTATE || ': ' || SQLERRM || ')', true);
    END IF;
  END;
END $$;

RESET role;

-- Consolidated result — every row must read PASS.
SELECT * FROM (VALUES
  ('1_partner_sees_only_open',        current_setting('chk.partner_sees_only_open', true)),
  ('2_partner_cannot_see_draft',      current_setting('chk.partner_cannot_see_draft', true)),
  ('3_confidential_employer_masked',  current_setting('chk.confidential_employer_masked', true)),
  ('4_admin_sees_all_and_unmasked',   current_setting('chk.admin_sees_all_and_unmasked', true)),
  ('5_partner_cannot_write',          current_setting('chk.partner_cannot_write', true)),
  ('6_anon_denied',                   current_setting('chk.anon_denied', true))
) AS t(check_name, result)
ORDER BY 1;

ROLLBACK;
