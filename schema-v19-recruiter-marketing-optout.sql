-- v19: Recruiter direct-marketing opt-out toggle
-- Adds a per-recruiter flag so admins can exclude a recruiter's candidates
-- from all marketing campaigns without deleting/deactivating the recruiter.
--
-- NOTE: public.gh_profiles is NOT `SELECT *` (it's an explicit column list),
-- so the view must be recreated to surface the new column. CREATE OR REPLACE
-- VIEW only allows appending columns at the end, which is what we do below.

ALTER TABLE globalhire.profiles
  ADD COLUMN allow_direct_marketing boolean NOT NULL DEFAULT true;

CREATE OR REPLACE VIEW public.gh_profiles AS
SELECT id,
    role,
    full_name,
    phone,
    specialty,
    specialty_detail,
    country_of_origin,
    years_of_experience,
    license_number,
    preferred_destinations,
    profile_completed,
    avatar_initials,
    avatar_color_index,
    created_at,
    updated_at,
    availability_status,
    availability_changed_at,
    deactivation_reason,
    recruiter_approved,
    organization_name,
    pipeline_stage,
    source,
    dataflow_completed,
    dataflow_number,
    dataflow_country,
    dataflow_via_elab,
    allow_direct_marketing
   FROM globalhire.profiles;
