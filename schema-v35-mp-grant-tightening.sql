-- schema-v35-mp-grant-tightening.sql
-- Hardening pass (Task 15 / A1 + A4): tighten the `mp_*` table/view grants.
--
-- Supabase stamps `ALTER DEFAULT PRIVILEGES` for `anon`+`authenticated` on every new
-- table/view at schema-creation time, independent of whatever GRANT statement the
-- migration itself issued. That is why all four mp_* tables (and their gh_mp_* views),
-- including mp_ai_runs whose own migration (schema-v32) asked for SELECT only, ended up
-- granting DELETE/INSERT/SELECT/UPDATE to BOTH anon and authenticated. RLS already denies
-- every one of these paths for non-owners (proven by 5 escalation attempts in prior task
-- reviews), so this is defense-in-depth: an explicit REVOKE is required, since simply not
-- granting is insufficient once the default-privilege grant has already landed.
--
-- Intended grants after this migration:
--   mp_agencies         authenticated: SELECT, UPDATE   (UPDATE needed: js/mp-onboarding.js
--                                                         saves the partnership profile via
--                                                         MP.mpFrom('agencies').update(...))
--   mp_agency_members   authenticated: SELECT only       (invite/accept are service-role)
--   mp_agency_invites   authenticated: SELECT only       (create/revoke/accept are service-role)
--   mp_ai_runs          authenticated: SELECT only       (inserts are service-role via mp-ai.ts)
--   anon                                : nothing on any of the four
-- Same shape mirrored onto the public.gh_mp_* security_invoker views (gh_mp_agencies
-- carries SELECT+UPDATE; the other three carry SELECT only; anon carries nothing).
BEGIN;

-- Base tables (globalhire schema)
REVOKE ALL ON globalhire.mp_agencies        FROM anon, authenticated;
REVOKE ALL ON globalhire.mp_agency_members  FROM anon, authenticated;
REVOKE ALL ON globalhire.mp_agency_invites  FROM anon, authenticated;
REVOKE ALL ON globalhire.mp_ai_runs         FROM anon, authenticated;

GRANT SELECT, UPDATE ON globalhire.mp_agencies        TO authenticated;
GRANT SELECT          ON globalhire.mp_agency_members TO authenticated;
GRANT SELECT          ON globalhire.mp_agency_invites TO authenticated;
GRANT SELECT          ON globalhire.mp_ai_runs        TO authenticated;

-- Public wrapper views (security_invoker = true — permission checks against the
-- underlying tables run as the invoking user, so the base-table grants above matter too)
REVOKE ALL ON public.gh_mp_agencies         FROM anon, authenticated;
REVOKE ALL ON public.gh_mp_agency_members   FROM anon, authenticated;
REVOKE ALL ON public.gh_mp_agency_invites   FROM anon, authenticated;
REVOKE ALL ON public.gh_mp_ai_runs          FROM anon, authenticated;

GRANT SELECT, UPDATE ON public.gh_mp_agencies         TO authenticated;
GRANT SELECT          ON public.gh_mp_agency_members  TO authenticated;
GRANT SELECT          ON public.gh_mp_agency_invites  TO authenticated;
GRANT SELECT          ON public.gh_mp_ai_runs         TO authenticated;

-- A4: InitPlan optimisation for the invites SELECT policy (schema-v31). auth.email() was
-- being re-evaluated per row; wrapping it as a scalar subquery lets Postgres hoist it into
-- an InitPlan, evaluated once per statement — consistent with how my_agency_ids() is
-- already wrapped in a subquery. Predicate meaning is unchanged.
DROP POLICY IF EXISTS mp_invites_agency_or_invitee_select ON globalhire.mp_agency_invites;
CREATE POLICY mp_invites_agency_or_invitee_select ON globalhire.mp_agency_invites
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT globalhire.my_agency_ids())
    OR lower(email) = lower((SELECT auth.email()))
    OR globalhire.is_admin()
  );

COMMIT;
