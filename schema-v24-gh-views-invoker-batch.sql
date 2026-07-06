-- v24_gh_views_invoker_batch
-- Task R5 of GlobalHire RLS remediation (.superpowers/sdd/rls-remediation-map.md §5 "All other
-- vulnerable views", §6 items 5 & 6; docs/superpowers/plans/2026-07-06-gh-rls-remediation.md Task R5).
--
-- These 26 public.gh_* wrapper views (+ the nested globalhire.admin_applicant_overview) are owned
-- by postgres (rolbypassrls=true) and NOT security_invoker, so any caller (anon/authenticated)
-- reading/writing through them bypasses RLS entirely on the underlying globalhire.* base tables.
--
-- Confirmed by live pg_class.reloptions query (2026-07-06) that these are the AUTHORITATIVE
-- still-non-invoker gh_* views remaining after R1-R4 already flipped gh_profiles,
-- gh_campaign_matches(+_write), gh_messages, gh_inbox, gh_recruiter_assignments,
-- gh_recruiter_notes (all confirmed reloptions=security_invoker=true already).
--
-- Per the remediation map §5/§3-medium-risk table, the existing policies on every underlying
-- globalhire.* base table already fully cover all found write/read paths in the app code for
-- these views -> NO new policies needed here, only the view-owner-bypass fix (security_invoker).
--
-- Nested-view finding (map §6.6) - INVESTIGATED, NOT FIXED HERE, FLAGGED FOR FOLLOW-UP:
-- gh_admin_applicant_overview wraps globalhire.admin_applicant_overview (a view over
-- globalhire.profiles + auth.users + globalhire.documents, filtered to role='applicant', with NO
-- caller-ownership scoping of its own). Confirmed via pg_get_viewdef that this nested view is ALSO
-- owned by postgres and NOT security_invoker, and that it JOINs auth.users directly (for the email
-- column).
--
-- Tested live (rolled back): flipping globalhire.admin_applicant_overview to security_invoker=true
-- breaks the view for EVERY caller, including admins, with "permission denied for table users" -
-- only `postgres` holds any grant on auth.users; `authenticated`/`anon`/`service_role` have none, so
-- under invoker mode the auth.users join in this view cannot execute for any non-superuser role.
-- This nested view was therefore REVERTED to security_invoker=false (its original state) after the
-- test, and is NOT flipped in this migration.
--
-- Consequence, also tested live (rolled back): with the outer public.gh_admin_applicant_overview
-- flipped to security_invoker=true but the inner globalhire.admin_applicant_overview left
-- non-invoker, a non-admin authenticated caller STILL sees all 366 applicant rows (identical to an
-- admin's 366) - the outer flip alone provides NO protection, because Postgres evaluates the inner
-- non-invoker view as its owner (postgres, rolbypassrls=true), fully bypassing RLS on profiles/
-- documents regardless of the outer view's setting. The outer flip is left in place anyway (it is a
-- necessary, harmless precondition for the real fix - the outer wrapper doing a plain
-- `SELECT * FROM globalhire.admin_applicant_overview` cannot be end-to-end safe until the inner view
-- is fixed) but IT DOES NOT CLOSE THE GAP BY ITSELF.
--
-- RESIDUAL RISK (open, tracked as follow-up, out of scope for this "no new policy" R5 batch): any
-- authenticated user can currently read admin_applicant_overview's 366-row full applicant dataset
-- (name, phone, license_number, dataflow_number/country, email, pipeline_status, etc. for every
-- applicant) via gh_admin_applicant_overview - this is a real, live, exploitable P0-adjacent gap, not
-- theoretical (confirmed live consumers: js/dashboard-live.js, js/candidates.js, js/analytics.js,
-- js/settings.js all call ghFrom('admin_applicant_overview') from admin-only UI pages, so the
-- underlying data need is real and admin-legitimate - the gap is that non-admins can replay the same
-- call). Proper fix requires rewriting admin_applicant_overview to avoid a direct auth.users join
-- under caller-role execution - e.g. wrap the auth.users lookup in a small SECURITY DEFINER helper
-- function (mirroring globalhire.is_admin()'s safe pattern) that admins can call, or drop the `email`
-- column from this view and source it from a definer-function instead - then re-attempt the
-- security_invoker flip on the inner view. This is dedicated follow-up work, not a one-line flip, and
-- must NOT be done as part of this "no new policy" batch without further design.

begin;

-- Remaining vulnerable public.gh_* wrapper views (26), existing policies already cover all
-- found write/read paths per map §3 medium-risk table / §5.
alter view public.gh_admin_applicant_overview set (security_invoker = true);
alter view public.gh_ai_recommendations set (security_invoker = true);
alter view public.gh_articles set (security_invoker = true);
alter view public.gh_campaign_activity_log set (security_invoker = true);
alter view public.gh_campaign_applications set (security_invoker = true);
alter view public.gh_campaign_applications_detail set (security_invoker = true);
alter view public.gh_campaigns set (security_invoker = true);
alter view public.gh_countries set (security_invoker = true);
alter view public.gh_documents set (security_invoker = true);
alter view public.gh_event_registrations set (security_invoker = true);
alter view public.gh_events set (security_invoker = true);
alter view public.gh_guides set (security_invoker = true);
alter view public.gh_job_alert_subscribers set (security_invoker = true);
alter view public.gh_job_applications set (security_invoker = true);
alter view public.gh_jobs set (security_invoker = true);
alter view public.gh_merged_documents set (security_invoker = true);
alter view public.gh_my_applications set (security_invoker = true);
alter view public.gh_my_opportunities set (security_invoker = true);
alter view public.gh_my_placements set (security_invoker = true);
alter view public.gh_partner_submissions set (security_invoker = true);
alter view public.gh_placement_activities set (security_invoker = true);
alter view public.gh_placement_checklist set (security_invoker = true);
alter view public.gh_placement_contracts set (security_invoker = true);
alter view public.gh_placements set (security_invoker = true);
alter view public.gh_registry_checks set (security_invoker = true);
alter view public.gh_saved_jobs set (security_invoker = true);
alter view public.gh_verification_audit set (security_invoker = true);

commit;
