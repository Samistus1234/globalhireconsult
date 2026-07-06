-- v24b_admin_applicant_overview_gate
-- Follow-up to Task R5 (.superpowers/sdd/rls-remediation-map.md §6.6; task-r5-report.md §3 residual risk).
--
-- CLOSES the live PII hole on gh_admin_applicant_overview identified in R5:
-- globalhire.admin_applicant_overview is an owner-executed (postgres, non-invoker) view that JOINs
-- auth.users for the `email` column. It CANNOT be flipped to security_invoker (only `postgres` holds
-- a grant on auth.users; under invoker mode the join errors "permission denied for table users" for
-- every non-superuser role, breaking the view for admins too). So the R5 batch left it non-invoker,
-- which meant ANY authenticated user could read all 366 applicants' full profile + email via the
-- outer public.gh_admin_applicant_overview wrapper (owner bypass of RLS).
--
-- Correct fix for a definer view over a privileged table: keep it owner-executed (so it can still
-- read auth.users) but SELF-GATE it with the SECURITY DEFINER predicate globalhire.is_admin(), so it
-- returns rows ONLY to admins. is_admin() is SECURITY DEFINER and resolves auth.uid() from the JWT,
-- so it works correctly even when evaluated inside this owner-executed view for a normal
-- authenticated caller.
--
-- Consumer check (grep js/ + *.html, 2026-07-06): the ONLY callers of ghFrom('admin_applicant_overview')
-- are js/dashboard-live.js, js/candidates.js, js/analytics.js, js/settings.js - all loaded exclusively
-- by dashboard.html / candidates.html / analytics.html / settings.html, each of which carries
-- <body data-auth-role="admin"> + js/auth-guard.js. Every consumer is admin-only, so gating with
-- is_admin() breaks no legitimate flow (admins still pass the predicate).
--
-- Definition below is byte-for-byte the current pg_get_viewdef output with only the WHERE clause
-- extended: `WHERE p.role = 'applicant' AND globalhire.is_admin()`. Owner stays postgres,
-- security_invoker stays unset (false) - CREATE OR REPLACE VIEW preserves both. The outer
-- public.gh_admin_applicant_overview wrapper is left as-is (already security_invoker=true from v24,
-- harmless).

begin;

create or replace view globalhire.admin_applicant_overview as
 SELECT p.id,
    p.role,
    p.full_name,
    p.phone,
    p.specialty,
    p.specialty_detail,
    p.country_of_origin,
    p.years_of_experience,
    p.license_number,
    p.preferred_destinations,
    p.profile_completed,
    p.avatar_initials,
    p.avatar_color_index,
    p.created_at,
    p.updated_at,
    p.availability_status,
    p.availability_changed_at,
    p.deactivation_reason,
    p.recruiter_approved,
    p.organization_name,
    p.pipeline_stage,
    p.source,
    p.dataflow_completed,
    p.dataflow_number,
    p.dataflow_country,
    p.dataflow_via_elab,
    p.migration_status,
    p.current_stage,
    u.email,
    COALESCE(dc.total_docs, 0::bigint) AS total_docs,
    COALESCE(dc.verified_docs, 0::bigint) AS verified_docs,
    COALESCE(dc.pending_docs, 0::bigint) AS pending_docs,
        CASE
            WHEN COALESCE(dc.total_docs, 0::bigint) = 0 THEN 'applied'::text
            WHEN p.profile_completed = false THEN 'screening'::text
            WHEN COALESCE(dc.pending_docs, 0::bigint) > 0 OR COALESCE(dc.inreview_docs, 0::bigint) > 0 THEN 'verifying'::text
            WHEN COALESCE(dc.verified_docs, 0::bigint) = COALESCE(dc.total_docs, 0::bigint) AND dc.total_docs > 0 THEN 'verified'::text
            ELSE 'screening'::text
        END AS pipeline_status
   FROM globalhire.profiles p
     JOIN auth.users u ON u.id = p.id
     LEFT JOIN ( SELECT documents.applicant_id,
            count(*) AS total_docs,
            count(*) FILTER (WHERE documents.status = 'verified'::text) AS verified_docs,
            count(*) FILTER (WHERE documents.status = 'pending'::text) AS pending_docs,
            count(*) FILTER (WHERE documents.status = 'in_review'::text) AS inreview_docs
           FROM globalhire.documents
          GROUP BY documents.applicant_id) dc ON dc.applicant_id = p.id
  WHERE p.role = 'applicant'::text AND globalhire.is_admin();

commit;
