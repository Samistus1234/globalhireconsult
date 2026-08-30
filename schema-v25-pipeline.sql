-- v25_unify_pipeline
-- GlobalHire (project evzhnsugmvtqgmvzwyix) -- PRODUCTION
--
-- Unifies the six fragmented stage systems into ONE master 16-stage pipeline
-- stored on profiles.pipeline_stage:
--   suggested → application_received → screening → qualified → shortlisted →
--   presented_to_employer → interview_scheduled → interview_completed →
--   offer_extended → offer_accepted → pre_employment → placement_confirmed →
--   started_employment → commission_due → invoiced → paid_closed
--
-- 1. Migrates legacy per-market pipeline_stage values to the new keys, then
--    pins the column with a CHECK.
-- 2. Adds exit columns (candidate moved out with a reason — rejected /
--    withdrawn / declined / terminated / placed_elsewhere) so dead-ends don't
--    linger as pipeline stages.
-- 3. Adds revenue columns (placement fee, invoice, paid) directly on the
--    candidate, per the decision to keep revenue ON the pipeline.
-- 4. Extends the v20 column-guard trigger so the new columns are admin-only
--    writes (same protection as pipeline_stage).
-- 5. Rewrites admin_applicant_overview so pipeline_status = the stored stage
--    (with a doc-derived fallback for legacy rows), and surfaces the new cols.

begin;

-- ============================================================================
-- 1. Migrate legacy pipeline_stage values → new unified keys
-- ============================================================================

update globalhire.profiles
set pipeline_stage = case
  when pipeline_stage in ('profile','verification') then 'screening'
  when pipeline_stage in ('dataflow','mumaris','prometric','license','licensing') then 'pre_employment'
  when pipeline_stage in ('visa','deployment') then 'placement_confirmed'
  when pipeline_stage = 'offer' then 'offer_accepted'
  when pipeline_stage is null then 'application_received'
  else pipeline_stage
end;

-- Defensive: anything else that slipped into the column (e.g. legacy
-- current_stage-style values) maps to screening so the CHECK below holds.
update globalhire.profiles
set pipeline_stage = 'screening'
where pipeline_stage not in (
  'suggested','application_received','screening','qualified','shortlisted',
  'presented_to_employer','interview_scheduled','interview_completed',
  'offer_extended','offer_accepted','pre_employment','placement_confirmed',
  'started_employment','commission_due','invoiced','paid_closed'
);

alter table globalhire.profiles
  add constraint profiles_pipeline_stage_check
  check (pipeline_stage in (
    'suggested','application_received','screening','qualified','shortlisted',
    'presented_to_employer','interview_scheduled','interview_completed',
    'offer_extended','offer_accepted','pre_employment','placement_confirmed',
    'started_employment','commission_due','invoiced','paid_closed'
  ));

-- ============================================================================
-- 2. Exit columns + 3. revenue columns on profiles
-- ============================================================================

alter table globalhire.profiles
  add column if not exists pipeline_exit_status text
    check (pipeline_exit_status in ('rejected','withdrawn','declined','terminated','placed_elsewhere')),
  add column if not exists pipeline_exit_reason text,
  add column if not exists pipeline_exited_at timestamptz,
  add column if not exists placement_fee numeric(12,2),
  add column if not exists fee_currency text not null default 'USD',
  add column if not exists invoice_number text,
  add column if not exists invoiced_at timestamptz,
  add column if not exists paid_at timestamptz;

-- ============================================================================
-- 4. Extend the v20 column guard to the new sensitive columns
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

  if new.role                       is distinct from old.role
  or new.recruiter_approved         is distinct from old.recruiter_approved
  or new.pipeline_stage             is distinct from old.pipeline_stage
  or new.pipeline_exit_status       is distinct from old.pipeline_exit_status
  or new.pipeline_exit_reason       is distinct from old.pipeline_exit_reason
  or new.pipeline_exited_at         is distinct from old.pipeline_exited_at
  or new.placement_fee              is distinct from old.placement_fee
  or new.fee_currency               is distinct from old.fee_currency
  or new.invoice_number             is distinct from old.invoice_number
  or new.invoiced_at                is distinct from old.invoiced_at
  or new.paid_at                    is distinct from old.paid_at
  or new.migration_status           is distinct from old.migration_status
  or new.current_stage              is distinct from old.current_stage
  or new.dataflow_completed         is distinct from old.dataflow_completed
  or new.dataflow_number            is distinct from old.dataflow_number
  or new.dataflow_country           is distinct from old.dataflow_country
  or new.dataflow_via_elab          is distinct from old.dataflow_via_elab
  or new.allow_direct_marketing     is distinct from old.allow_direct_marketing then
    raise exception 'Only admins may modify protected profile columns'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 5. Rewrite admin_applicant_overview
--    (kept owner-executed + is_admin() self-gate exactly as v24b; only the
--    pipeline_status derivation and select list change)
-- ============================================================================

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
    COALESCE(p.pipeline_stage,
        CASE
            WHEN COALESCE(dc.total_docs, 0::bigint) = 0 THEN 'application_received'::text
            WHEN p.profile_completed = false THEN 'screening'::text
            WHEN COALESCE(dc.pending_docs, 0::bigint) > 0 OR COALESCE(dc.inreview_docs, 0::bigint) > 0 THEN 'screening'::text
            WHEN COALESCE(dc.verified_docs, 0::bigint) = COALESCE(dc.total_docs, 0::bigint) AND dc.total_docs > 0 THEN 'qualified'::text
            ELSE 'screening'::text
        END) AS pipeline_status,
    p.pipeline_exit_status,
    p.pipeline_exit_reason,
    p.pipeline_exited_at,
    p.placement_fee,
    p.fee_currency,
    p.invoice_number,
    p.invoiced_at,
    p.paid_at
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

-- ============================================================================
-- 6. Placements: realign stage values to the unified keys + surface revenue
-- ============================================================================

alter table globalhire.placements
  drop constraint if exists placements_stage_check;

-- Legacy deployment stages → unified pipeline keys (same mapping the JS uses
-- for display; this makes stored rows carry the new keys).
update globalhire.placements
set stage = case
  when stage = 'visa_processing' then 'pre_employment'
  when stage = 'contract'        then 'placement_confirmed'
  when stage = 'onboarding'      then 'started_employment'
  when stage = 'active'          then 'commission_due'
  when stage = 'completed'       then 'paid_closed'
  else stage
end;

alter table globalhire.placements
  add constraint placements_stage_check
  check (stage in (
    'offer_extended','offer_accepted','pre_employment','placement_confirmed',
    'started_employment','commission_due','invoiced','paid_closed','terminated'
  ));

-- gh_placements: expose the candidate's revenue fields (they live on profiles,
-- decoupled from whether a placement row exists). Admin-gated: the placements
-- page (placements.html) is admin-only and reads revenue from here; applicants
-- use gh_my_placements (no revenue columns), so the gate blocks non-admin
-- reads of the joined revenue without breaking any applicant surface.
create or replace view public.gh_placements as
SELECT
  p.*,
  pr.full_name AS applicant_name,
  pr.avatar_initials,
  pr.avatar_color_index,
  cm.match_score,
  c.title AS campaign_title,
  pr.placement_fee,
  pr.fee_currency,
  pr.invoice_number,
  pr.invoiced_at,
  pr.paid_at
FROM globalhire.placements p
LEFT JOIN globalhire.profiles pr ON pr.id = p.applicant_id
LEFT JOIN globalhire.campaign_matches cm ON cm.id = p.match_id
LEFT JOIN globalhire.campaigns c ON c.id = p.campaign_id
WHERE globalhire.is_admin();

alter view public.gh_placements set (security_invoker = true);

-- ============================================================================
-- 7. Refresh the public wrapper view so its frozen SELECT * re-expands to the
--    new columns. Postgres expands SELECT * at view-creation time, so the
--    pre-v25 wrapper still exposes only the old 33 columns — recreating it here
--    is what surfaces pipeline_exit_status / revenue columns to PostgREST.
--    (CREATE OR REPLACE preserves existing grants on the view.)
-- ============================================================================

create or replace view public.gh_admin_applicant_overview as
  select * from globalhire.admin_applicant_overview;

alter view public.gh_admin_applicant_overview set (security_invoker = true);

-- Same freeze applies to gh_profiles (the recruiter/portal read surface) — it
-- was created with a fixed 28-column list, so the v25 columns were invisible
-- to PostgREST until recreated. Append the new columns at the END of the list
-- (CREATE OR REPLACE VIEW refuses implicit column renames by position).
-- gh_profiles deliberately keeps PLAIN columns (no CASE-masking on the revenue
-- fields). Masking made the view non-auto-updatable (any expression column kills
-- ALL view writes — PostgREST 0A000), which broke every profile write path:
-- candidate stage edits, profile self-edits, and revenue entry all PATCH through
-- this view. Security is enforced at the row level instead: RLS confines reads to
-- the applicant's own row (gh_users_read_own_profile), and the v25-extended
-- gh_profiles_column_guard trigger blocks non-admin writes of revenue/stage
-- (verified live: applicant PATCH of placement_fee → 403 42501).
create or replace view public.gh_profiles as
SELECT id, role, full_name, phone, specialty, specialty_detail, country_of_origin,
  years_of_experience, license_number, preferred_destinations, profile_completed,
  avatar_initials, avatar_color_index, created_at, updated_at, availability_status,
  availability_changed_at, deactivation_reason, recruiter_approved, organization_name,
  pipeline_stage, source, dataflow_completed, dataflow_number, dataflow_country,
  dataflow_via_elab, allow_direct_marketing,
  pipeline_exit_status, pipeline_exit_reason, pipeline_exited_at,
  placement_fee, fee_currency, invoice_number, invoiced_at, paid_at
FROM globalhire.profiles;

alter view public.gh_profiles set (security_invoker = true);

commit;
