-- schema-v18-recruiter-submitted-candidates.sql
-- GlobalHire (project evzhnsugmvtqgmvzwyix)
--
-- Recruiter candidate-submission feature: a recruiter submits a candidate for admin
-- review; admins triage (admin_status / notes / reviewer) and can promote an accepted
-- submission into a real globalhire.profiles row (promoted_profile_id).
--
-- NOTE: this is a BRAND-NEW table. It deliberately does NOT reuse or touch the
-- pre-existing public.recruiter_clients / referrers / recruiter_performance_metrics
-- cluster (a separate dormant referral/commission feature).
--
-- Schema convention: base tables live in `globalhire`, exposed to the app via a
-- `public.gh_<name>` view resolved by the front-end helper ghFrom('<name>').
--
-- SECURITY MODEL — views use `security_invoker = true` (matching the existing
-- gh_visa_* views), NOT the older gh_profiles style. gh_profiles is a non-invoker
-- view owned by `postgres`, and `postgres` has rolbypassrls=true, so RLS on the
-- underlying globalhire table is BYPASSED when read through that view. Because this
-- table carries candidate PII plus admin-only review fields and must enforce
-- per-recruiter ownership + admin-only columns, the view must run as the invoking
-- user so RLS actually applies. `authenticated` already has USAGE on schema globalhire.

-- ============================================================================
-- 1. Base tables (globalhire schema) — fresh CREATE, no ALTER ... SET SCHEMA
-- ============================================================================

create table globalhire.recruiter_submitted_candidates (
  id                  uuid primary key default gen_random_uuid(),
  recruiter_id        uuid not null,                 -- submitting recruiter = globalhire.profiles.id
  full_name           text not null,
  email               text,
  phone               text,
  profession          text,
  specialty           text,
  experience_years    integer,
  current_country     text,
  target_countries    text[],
  passport_number     text,
  license_number      text,
  profile_data        jsonb,
  status              text not null default 'new',    -- recruiter-facing workflow status
  admin_status        text not null default 'submitted'
                        check (admin_status in ('submitted','under_review','shortlisted','placed','rejected')),
  admin_note          text,
  reviewed_by         uuid,
  reviewed_at         timestamptz,
  promoted_profile_id uuid,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index idx_gh_rsc_recruiter_id  on globalhire.recruiter_submitted_candidates (recruiter_id);
create index idx_gh_rsc_admin_status   on globalhire.recruiter_submitted_candidates (admin_status);

create table globalhire.recruiter_submission_documents (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references globalhire.recruiter_submitted_candidates(id) on delete cascade,
  recruiter_id    uuid not null,
  doc_type        text not null,
  file_name       text,
  file_path       text not null,
  mime_type       text,
  file_size_bytes bigint,
  status          text not null default 'pending',
  created_at      timestamptz default now()
);

create index idx_gh_rsd_submission_id on globalhire.recruiter_submission_documents (submission_id);
create index idx_gh_rsd_recruiter_id  on globalhire.recruiter_submission_documents (recruiter_id);

-- ============================================================================
-- 2. Triggers
-- ============================================================================

-- Keep updated_at fresh on the submissions table.
create or replace function globalhire.gh_rsc_set_updated_at()
returns trigger
language plpgsql
set search_path = globalhire, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_gh_rsc_set_updated_at
  before update on globalhire.recruiter_submitted_candidates
  for each row execute function globalhire.gh_rsc_set_updated_at();

-- Column-level guard: recruiters may NOT write the admin review fields
-- (admin_status, admin_note, reviewed_by, reviewed_at, promoted_profile_id).
-- Admins (globalhire.is_admin()) and trusted backend contexts (service_role, where
-- auth.uid() is null) are exempt. On recruiter INSERT the fields are forced to safe
-- defaults; on recruiter UPDATE any attempted change is rejected.
create or replace function globalhire.gh_rsc_review_guard()
returns trigger
language plpgsql
set search_path = globalhire, public, pg_catalog
as $$
begin
  if globalhire.is_admin() or auth.uid() is null then
    return new;  -- admin user, or trusted backend/service_role context
  end if;

  if tg_op = 'INSERT' then
    new.admin_status        := 'submitted';
    new.admin_note          := null;
    new.reviewed_by         := null;
    new.reviewed_at         := null;
    new.promoted_profile_id := null;
    return new;
  end if;

  -- tg_op = 'UPDATE' by a recruiter
  if new.admin_status        is distinct from old.admin_status
  or new.admin_note          is distinct from old.admin_note
  or new.reviewed_by         is distinct from old.reviewed_by
  or new.reviewed_at         is distinct from old.reviewed_at
  or new.promoted_profile_id is distinct from old.promoted_profile_id then
    raise exception 'Recruiters may not modify admin review fields (admin_status, admin_note, reviewed_by, reviewed_at, promoted_profile_id)'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_gh_rsc_review_guard
  before insert or update on globalhire.recruiter_submitted_candidates
  for each row execute function globalhire.gh_rsc_review_guard();

-- ============================================================================
-- 3. Row Level Security
-- ============================================================================

alter table globalhire.recruiter_submitted_candidates enable row level security;
alter table globalhire.recruiter_submission_documents  enable row level security;

-- submissions: recruiter owns own rows -----------------------------------------
create policy gh_rsc_recruiter_select
  on globalhire.recruiter_submitted_candidates
  for select to authenticated
  using (recruiter_id = auth.uid());

create policy gh_rsc_recruiter_insert
  on globalhire.recruiter_submitted_candidates
  for insert to authenticated
  with check (recruiter_id = auth.uid());

create policy gh_rsc_recruiter_update
  on globalhire.recruiter_submitted_candidates
  for update to authenticated
  using (recruiter_id = auth.uid())
  with check (recruiter_id = auth.uid());

-- submissions: admin full access -----------------------------------------------
create policy gh_rsc_admin_all
  on globalhire.recruiter_submitted_candidates
  for all to authenticated
  using (globalhire.is_admin())
  with check (globalhire.is_admin());

-- documents: recruiter owns own rows -------------------------------------------
create policy gh_rsd_recruiter_select
  on globalhire.recruiter_submission_documents
  for select to authenticated
  using (recruiter_id = auth.uid());

create policy gh_rsd_recruiter_insert
  on globalhire.recruiter_submission_documents
  for insert to authenticated
  with check (recruiter_id = auth.uid());

create policy gh_rsd_recruiter_update
  on globalhire.recruiter_submission_documents
  for update to authenticated
  using (recruiter_id = auth.uid())
  with check (recruiter_id = auth.uid());

-- documents: admin full access -------------------------------------------------
create policy gh_rsd_admin_all
  on globalhire.recruiter_submission_documents
  for all to authenticated
  using (globalhire.is_admin())
  with check (globalhire.is_admin());

-- ============================================================================
-- 4. Base-table grants (needed by security_invoker views, checked as invoker)
-- ============================================================================

grant select, insert, update on globalhire.recruiter_submitted_candidates to authenticated, service_role;
grant select, insert, update on globalhire.recruiter_submission_documents  to authenticated, service_role;

-- ============================================================================
-- 5. public.gh_* views (security_invoker=true) + grants
-- ============================================================================

create view public.gh_recruiter_submitted_candidates
  with (security_invoker = true) as
  select * from globalhire.recruiter_submitted_candidates;

create view public.gh_recruiter_submission_documents
  with (security_invoker = true) as
  select * from globalhire.recruiter_submission_documents;

grant select, insert, update on public.gh_recruiter_submitted_candidates to authenticated, service_role;
grant select, insert, update on public.gh_recruiter_submission_documents  to authenticated, service_role;

-- ============================================================================
-- 6. IDOR fix (migration v18_rsd_idor_fix)
-- ============================================================================
-- The original recruiter document policies only checked recruiter_id = auth.uid()
-- on the document row, NOT that the referenced submission belongs to that recruiter.
-- A recruiter could therefore attach/reassign a document to another recruiter's
-- submission. Recreate both policies with an EXISTS predicate validating that the
-- referenced submission is owned by the acting recruiter.

drop policy gh_rsd_recruiter_insert on globalhire.recruiter_submission_documents;
drop policy gh_rsd_recruiter_update on globalhire.recruiter_submission_documents;

create policy gh_rsd_recruiter_insert
  on globalhire.recruiter_submission_documents
  for insert to authenticated
  with check (
    recruiter_id = auth.uid()
    and exists (
      select 1 from globalhire.recruiter_submitted_candidates s
      where s.id = submission_id and s.recruiter_id = auth.uid()
    )
  );

create policy gh_rsd_recruiter_update
  on globalhire.recruiter_submission_documents
  for update to authenticated
  using (
    recruiter_id = auth.uid()
    and exists (
      select 1 from globalhire.recruiter_submitted_candidates s
      where s.id = submission_id and s.recruiter_id = auth.uid()
    )
  )
  with check (
    recruiter_id = auth.uid()
    and exists (
      select 1 from globalhire.recruiter_submitted_candidates s
      where s.id = submission_id and s.recruiter_id = auth.uid()
    )
  );
