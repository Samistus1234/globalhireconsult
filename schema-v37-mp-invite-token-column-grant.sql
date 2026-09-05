-- schema-v37-mp-invite-token-column-grant.sql
-- CRITICAL FIX (FINAL whole-branch review of Chunk 1, finding 1): invite `token` was
-- client-readable, defeating the view that deliberately withholds it.
--
-- schema-v31 created public.gh_mp_agency_invites omitting `token` on purpose ("never
-- needed client-side — accept happens via the emailed link → edge fn"), but the GRANT
-- backing it (schema-v31, re-issued unchanged by schema-v35's tightening pass) was
-- TABLE-level: `GRANT SELECT ON globalhire.mp_agency_invites TO authenticated` covers
-- every column, `token` included. A Postgres column-omission in a view is enforced only
-- by the view definition — it is NOT a privilege boundary. Because the `globalhire`
-- schema is exposed over PostgREST (mandated repo-wide; five live client files send
-- `Accept-Profile: globalhire`), any authenticated principal could bypass the view
-- entirely and `select token from globalhire.mp_agency_invites` directly.
--
-- Empirically confirmed exploit path (rolled-back synthetic session, see
-- tests/rls/mp-isolation.sql check 12 and the review report): the project auto-confirms
-- email, so an attacker who merely knows an invited address can sign up at it, read the
-- raw token, POST it to mp-agency-invite-accept (email bind passes — they now own that
-- JWT claim; one-agency guard passes — they have no membership), and join that agency —
-- gaining its member list, its storage documents under marketplace/agency/<id>/, and
-- later its candidate database.
--
-- Fix: replace the table-level grant with a COLUMN-level grant naming exactly the eight
-- columns the client view selects. The view's omission of `token` (and of `invited_by` /
-- `accepted_user_id`, never selected by the view either) is now enforced twice — once by
-- the view definition, once by the base-table grant — so bypassing the view no longer
-- bypasses the column boundary.
--
-- security_invoker on public.gh_mp_agency_invites (schema-v31) is left AS-IS
-- (security_invoker = true, i.e. the default — do NOT set it to false, which would
-- discard RLS entirely). A security_invoker view's column access is checked against the
-- INVOKING user's own privileges on the underlying columns; since the view selects
-- exactly {id, agency_id, email, role, status, expires_at, accepted_at, created_at}, and
-- those are exactly the eight columns granted below, the view continues to resolve for
-- `authenticated` with no further change needed.
BEGIN;

REVOKE SELECT ON globalhire.mp_agency_invites FROM authenticated;
GRANT SELECT (id, agency_id, email, role, status, expires_at, accepted_at, created_at)
  ON globalhire.mp_agency_invites TO authenticated;

COMMIT;
