-- schema-v42-mp-jobs.sql
-- Partner Marketplace S2: the job board.
-- Spec: docs/superpowers/specs/2026-09-03-globalhire-partner-marketplace-design.md §5.2, §6.1, §9
BEGIN;

CREATE TABLE globalhire.mp_jobs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                  text NOT NULL,
  employer_name          text,
  employer_confidential  boolean NOT NULL DEFAULT false,
  destination_country    text,
  city                   text,
  specialty              text,
  subspecialty           text,
  seniority_level        text,
  contract_type          text CHECK (contract_type IN ('permanent','locum','temporary')),
  facility_type          text,
  positions_count        int NOT NULL DEFAULT 1 CHECK (positions_count > 0),
  salary_min             numeric,
  salary_max             numeric,
  salary_currency        text,
  salary_display         text,
  benefits               text[] NOT NULL DEFAULT '{}',
  jd_text                text,
  status                 text NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','open','paused','filled','closed')),
  placement_fee_amount   numeric,
  placement_fee_currency text,
  partner_split_pct      numeric NOT NULL DEFAULT 50
                           CHECK (partner_split_pct >= 0 AND partner_split_pct <= 100),
  source                 text NOT NULL DEFAULT 'internal'
                           CHECK (source IN ('internal','employer','imported')),
  origin_campaign_id     uuid,
  min_experience_years   int,
  required_licences      text[] NOT NULL DEFAULT '{}',
  required_exams         text[] NOT NULL DEFAULT '{}',
  nationality_prefs      text[] NOT NULL DEFAULT '{}',
  gender_pref            text,
  age_min                int,
  age_max                int,
  language_reqs          text[] NOT NULL DEFAULT '{}',
  extra_criteria         jsonb NOT NULL DEFAULT '{}'::jsonb,
  posted_by              uuid NOT NULL,
  published_at           timestamptz,
  closes_at              timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mp_jobs_open_idx ON globalhire.mp_jobs (published_at DESC) WHERE status = 'open';
CREATE INDEX mp_jobs_status_idx ON globalhire.mp_jobs (status, created_at DESC);

ALTER TABLE globalhire.mp_jobs ENABLE ROW LEVEL SECURITY;

-- Jobs belong to GlobalHire, not to an agency, so this is NOT the my_agency_ids()
-- predicate used by every other mp_* table. An admin sees everything; an active
-- member of ANY verified agency sees only open jobs.
CREATE POLICY mp_jobs_admin_all ON globalhire.mp_jobs
  FOR ALL TO authenticated
  USING (globalhire.is_admin()) WITH CHECK (globalhire.is_admin());

CREATE POLICY mp_jobs_partner_open_select ON globalhire.mp_jobs
  FOR SELECT TO authenticated
  USING (
    status = 'open'
    AND EXISTS (SELECT 1 FROM globalhire.my_agency_ids())
  );

-- Masking lives in the view so no page script can leak a confidential employer.
CREATE VIEW public.gh_mp_jobs WITH (security_invoker = true) AS
  SELECT
    j.id, j.title,
    CASE WHEN j.employer_confidential AND NOT globalhire.is_admin()
         THEN NULL ELSE j.employer_name END AS employer_name,
    j.employer_confidential,
    j.destination_country, j.city, j.specialty, j.subspecialty, j.seniority_level,
    j.contract_type, j.facility_type, j.positions_count,
    j.salary_min, j.salary_max, j.salary_currency, j.salary_display,
    j.benefits, j.jd_text, j.status,
    j.placement_fee_amount, j.placement_fee_currency, j.partner_split_pct,
    j.source, j.origin_campaign_id,
    j.min_experience_years, j.required_licences, j.required_exams,
    j.nationality_prefs, j.gender_pref, j.age_min, j.age_max,
    j.language_reqs, j.extra_criteria,
    j.posted_by, j.published_at, j.closes_at, j.created_at, j.updated_at
  FROM globalhire.mp_jobs j;

REVOKE ALL ON globalhire.mp_jobs FROM anon, authenticated;
REVOKE ALL ON public.gh_mp_jobs  FROM anon, authenticated;
GRANT SELECT ON globalhire.mp_jobs TO authenticated;
GRANT SELECT ON public.gh_mp_jobs  TO authenticated;

COMMIT;
