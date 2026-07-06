-- schema-v20-gh-profiles-rls.sql
-- GlobalHire (project evzhnsugmvtqgmvzwyix) -- PRODUCTION
--
-- Migration: v20_gh_profiles_rls
--
-- Closes the P0 privilege-escalation hole documented in
-- .superpowers/sdd/rls-remediation-map.md (§5 profiles, §6 item 1) and
-- docs/superpowers/plans/2026-07-06-gh-rls-remediation.md (Task R1).
--
-- Problem: public.gh_profiles is a postgres-owned view WITHOUT security_invoker.
-- postgres has rolbypassrls=true, so RLS on globalhire.profiles is bypassed when
-- read/written through this view -- any authenticated user can currently run
-- ghFrom('profiles').update({ role: 'admin' }).eq('id', <own uid>) from the
-- browser console and self-escalate to admin.
--
-- Fix requires THREE changes shipped atomically:
--   1. Flip the view to security_invoker=true so RLS actually applies.
--   2. Add an admin UPDATE policy (none exists today) so legitimate admin flows
--      (recruiters-admin.js:178 allow_direct_marketing toggle; candidates.js:843
--      pipeline_stage drag-drop; candidates.js:1390 migration_status/current_stage
--      milestone edits) keep working once the bypass is closed.
--   3. Add a column-guard trigger, because the existing own-row UPDATE policy
--      (gh_users_update_own_profile) has NO column restriction. Without the
--      trigger, flipping the view alone does NOT stop self-escalation: a user
--      updating their OWN row would still satisfy `auth.uid() = id` and could
--      set role='admin', recruiter_approved=true, etc. on themselves.
--
-- Pattern mirrors globalhire.gh_rsc_review_guard() (schema-v18-recruiter-
-- submitted-candidates.sql) -- admins and trusted backend contexts
-- (auth.uid() IS NULL, i.e. service_role) are exempt; everyone else is blocked
-- from changing the listed sensitive columns, whether on their own row or not
-- (non-admins have no path to another user's row anyway via the row-level
-- policies, but the column guard is unconditional for defense in depth).

-- ============================================================================
-- 1. View: flip to security_invoker so RLS on globalhire.profiles applies
-- ============================================================================

alter view public.gh_profiles set (security_invoker = true);

-- ============================================================================
-- 2. Admin UPDATE policy (none existed before this migration)
-- ============================================================================

create policy gh_admins_update_all_profiles
  on globalhire.profiles
  for update
  to authenticated
  using (globalhire.is_admin())
  with check (globalhire.is_admin());

-- ============================================================================
-- 3. Column-guard trigger: block non-admins from changing sensitive columns
-- ============================================================================

create or replace function globalhire.gh_profiles_column_guard()
returns trigger
language plpgsql
set search_path = globalhire, pg_catalog
as $$
begin
  if globalhire.is_admin() or auth.uid() is null then
    return new;  -- admin user, or trusted backend/service_role context
  end if;

  if new.role                    is distinct from old.role
  or new.recruiter_approved      is distinct from old.recruiter_approved
  or new.pipeline_stage          is distinct from old.pipeline_stage
  or new.migration_status        is distinct from old.migration_status
  or new.current_stage           is distinct from old.current_stage
  or new.dataflow_completed      is distinct from old.dataflow_completed
  or new.dataflow_number         is distinct from old.dataflow_number
  or new.dataflow_country        is distinct from old.dataflow_country
  or new.dataflow_via_elab       is distinct from old.dataflow_via_elab
  or new.allow_direct_marketing  is distinct from old.allow_direct_marketing then
    raise exception 'Only admins may modify role, recruiter_approved, pipeline_stage, migration_status, current_stage, dataflow_completed, dataflow_number, dataflow_country, dataflow_via_elab, or allow_direct_marketing'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger gh_profiles_column_guard
  before update on globalhire.profiles
  for each row execute function globalhire.gh_profiles_column_guard();
