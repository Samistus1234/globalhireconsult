-- schema-v21-gh-campaign-matches-rls.sql
-- GlobalHire (project evzhnsugmvtqgmvzwyix) -- PRODUCTION
--
-- Migration: v21_gh_campaign_matches_rls
--
-- Closes the view-owner-bypass on public.gh_campaign_matches /
-- public.gh_campaign_matches_write documented in
-- .superpowers/sdd/rls-remediation-map.md (§3 portal.js:876, §5 campaign_matches)
-- and docs/superpowers/plans/2026-07-06-gh-rls-remediation.md (Task R2).
--
-- Problem: both views are postgres-owned WITHOUT security_invoker. postgres has
-- rolbypassrls=true, so RLS on globalhire.campaign_matches is bypassed when
-- read/written through these views. Today the applicant "respond to
-- opportunity" flow (js/portal.js:876, ghFrom('campaign_matches_write')
-- .update({response, responded_at}).eq('id', matchId), no applicant_id filter
-- in the query itself) only works because of this bypass -- there is NO
-- applicant-scoped UPDATE policy on globalhire.campaign_matches at all today
-- (only gh_admins_manage_matches ALL + gh_applicants_read_own_matches SELECT).
--
-- Fix requires THREE changes shipped atomically:
--   1. Flip both views to security_invoker=true so RLS actually applies.
--   2. Add an applicant-scoped UPDATE policy (none exists today) so
--      portal.js:876 keeps working once the bypass is closed.
--   3. Add a column-guard trigger, because a bare applicant_id=auth.uid()
--      UPDATE policy would let an applicant rewrite ANY column on their own
--      match row (match_score, email_status, response_token, campaign_id,
--      etc.), not just their response. Only response, response_note, and
--      responded_at may be changed by a non-admin.
--
-- Pattern mirrors globalhire.gh_profiles_column_guard() (schema-v20-gh-
-- profiles-rls.sql, migration v20_gh_profiles_rls) -- admins and trusted
-- backend contexts (auth.uid() IS NULL, i.e. service_role) are exempt;
-- everyone else is blocked from changing any column other than the three
-- response columns.

-- ============================================================================
-- 1. Views: flip to security_invoker so RLS on globalhire.campaign_matches
--    applies
-- ============================================================================

alter view public.gh_campaign_matches set (security_invoker = true);
alter view public.gh_campaign_matches_write set (security_invoker = true);

-- ============================================================================
-- 2. Applicant UPDATE policy (none existed before this migration)
-- ============================================================================

create policy gh_applicants_update_own_matches
  on globalhire.campaign_matches
  for update
  to authenticated
  using (applicant_id = auth.uid())
  with check (applicant_id = auth.uid());

-- ============================================================================
-- 3. Column-guard trigger: non-admins may only change response,
--    response_note, responded_at
-- ============================================================================

create or replace function globalhire.gh_campaign_matches_column_guard()
returns trigger
language plpgsql
set search_path = globalhire, pg_catalog
as $$
begin
  if globalhire.is_admin() or auth.uid() is null then
    return new;  -- admin user, or trusted backend/service_role context
  end if;

  if new.campaign_id     is distinct from old.campaign_id
  or new.applicant_id    is distinct from old.applicant_id
  or new.match_score     is distinct from old.match_score
  or new.match_reasons   is distinct from old.match_reasons
  or new.email_status    is distinct from old.email_status
  or new.email_sent_at   is distinct from old.email_sent_at
  or new.email_error     is distinct from old.email_error
  or new.response_token  is distinct from old.response_token
  or new.token_expires_at is distinct from old.token_expires_at
  or new.created_at      is distinct from old.created_at then
    raise exception 'Only admins may modify campaign_id, applicant_id, match_score, match_reasons, email_status, email_sent_at, email_error, response_token, token_expires_at, or created_at'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger gh_campaign_matches_column_guard
  before update on globalhire.campaign_matches
  for each row execute function globalhire.gh_campaign_matches_column_guard();
