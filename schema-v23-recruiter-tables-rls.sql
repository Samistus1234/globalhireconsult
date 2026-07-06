-- v23_recruiter_tables_rls
-- Task R4 of GlobalHire RLS remediation (.superpowers/sdd/rls-remediation-map.md §3, §5;
-- docs/superpowers/plans/2026-07-06-gh-rls-remediation.md Task R4).
--
-- globalhire.recruiter_assignments and globalhire.recruiter_notes currently have RLS DISABLED
-- and zero policies. Their public wrapper views (gh_recruiter_assignments, gh_recruiter_notes)
-- are owned by postgres (rolbypassrls=true) and NOT security_invoker, so today ANY caller
-- (anon/authenticated) reading through the view bypasses RLS entirely on the base tables.
--
-- Confirmed via grep of js/*.js and supabase/functions/*/index.ts: the ONLY client-side call
-- sites (ghFrom('recruiter_assignments'), ghFrom('recruiter_notes')) are SELECT reads:
--   js/recruiter.js:192,216,459,716 (recruiter portal, own assignments/notes)
--   js/candidates.js:519,668 (admin candidate panel)
-- All WRITES to both tables go through the manage-recruiter edge function using the
-- service-role client (supabase/functions/manage-recruiter/index.ts:41-43,61,87) and
-- check-recruiter-inactivity (service-role, :33-35), which bypass RLS regardless of policies.
-- No client INSERT/UPDATE/DELETE path exists -> SELECT-only policies are sufficient and safe.

begin;

-- 1. Enable RLS on both base tables.
alter table globalhire.recruiter_assignments enable row level security;
alter table globalhire.recruiter_notes enable row level security;

-- 2. Covering SELECT policies.
create policy gh_recruiters_read_own_assignments
  on globalhire.recruiter_assignments
  for select
  to authenticated
  using (recruiter_id = auth.uid());

create policy gh_admins_read_all_assignments
  on globalhire.recruiter_assignments
  for select
  to authenticated
  using (globalhire.is_admin());

create policy gh_recruiters_read_own_notes
  on globalhire.recruiter_notes
  for select
  to authenticated
  using (recruiter_id = auth.uid());

create policy gh_admins_read_all_notes
  on globalhire.recruiter_notes
  for select
  to authenticated
  using (globalhire.is_admin());

-- 3. Flip the wrapper views to security_invoker so the RLS above is actually enforced
--    through PostgREST (owner `postgres` has rolbypassrls=true; without this flag the
--    view would still bypass the policies just added).
alter view public.gh_recruiter_assignments set (security_invoker = true);
alter view public.gh_recruiter_notes set (security_invoker = true);

commit;
