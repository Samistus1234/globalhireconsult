-- ============================================
-- GLOBALHIRE@ELAB — Schema v14
-- Migration milestones on profiles + consultations
-- ============================================
--
-- Adds two columns to profiles + consultations so the candidate's
-- migration journey (DataFlow, Prometric, Mumaris+, Sheryan, OMSB,
-- NCLEX, IELTS/OET, current stage) is visible at a glance — without
-- having to open each candidate's documents.
--
--   migration_status  jsonb  — flexible per-credential map:
--     {
--       "dataflow":       { "saudi": "done", "qatar": "in_progress" },
--       "prometric":      { "saudi": "passed", "qatar": "scheduled" },
--       "mumaris_plus":   "done",
--       "sheryan":        "done",
--       "omsb":           "passed",
--       "nclex":          "passed",
--       "english":        { "ielts": "done", "oet": null }
--     }
--
--   current_stage     text   — denormalised single-value picker for
--     fast filter/sort. Allowed values:
--       inquiry | docs_pending | dataflow | prometric |
--       license_application | visa | placed | other
--
-- Run once in the Supabase SQL editor.

-- ── 1. globalhire.profiles ──────────────────────────────────────────
ALTER TABLE globalhire.profiles
  ADD COLUMN IF NOT EXISTS migration_status jsonb,
  ADD COLUMN IF NOT EXISTS current_stage    text;

COMMENT ON COLUMN globalhire.profiles.migration_status
  IS 'Per-credential migration map: dataflow/prometric/mumaris_plus/sheryan/omsb/nclex/english. See schema-v14.sql for shape.';
COMMENT ON COLUMN globalhire.profiles.current_stage
  IS 'Denormalised single-value migration stage for fast filter/sort: inquiry | docs_pending | dataflow | prometric | license_application | visa | placed | other.';

-- ── 2. public.elab_complete_consultations ──────────────────────────
-- Capture the same milestones at booking time so we have it before
-- the candidate ever logs into the GlobalHire portal.
ALTER TABLE public.elab_complete_consultations
  ADD COLUMN IF NOT EXISTS migration_status jsonb,
  ADD COLUMN IF NOT EXISTS current_stage    text;

COMMENT ON COLUMN public.elab_complete_consultations.migration_status
  IS 'Migration milestones declared at booking. Same shape as globalhire.profiles.migration_status.';
COMMENT ON COLUMN public.elab_complete_consultations.current_stage
  IS 'Migration stage declared at booking. Same allowed values as globalhire.profiles.current_stage.';

-- ── 3. Refresh admin_applicant_overview view ───────────────────────
-- Pass-through every profile column with `p.*` so any field added later
-- (dataflow_completed, source, etc.) flows through automatically. Then
-- supplement with email and document counts.
DROP VIEW IF EXISTS globalhire.admin_applicant_overview CASCADE;
CREATE VIEW globalhire.admin_applicant_overview AS
SELECT
  p.*,
  u.email,
  COALESCE(dc.total_docs, 0)    AS total_docs,
  COALESCE(dc.verified_docs, 0) AS verified_docs,
  COALESCE(dc.pending_docs, 0)  AS pending_docs,
  CASE
    WHEN COALESCE(dc.total_docs, 0) = 0 THEN 'applied'
    WHEN p.profile_completed = FALSE THEN 'screening'
    WHEN COALESCE(dc.pending_docs, 0) > 0 OR COALESCE(dc.inreview_docs, 0) > 0 THEN 'verifying'
    WHEN COALESCE(dc.verified_docs, 0) = COALESCE(dc.total_docs, 0) AND dc.total_docs > 0 THEN 'verified'
    ELSE 'screening'
  END AS pipeline_status
FROM globalhire.profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN (
  SELECT
    applicant_id,
    COUNT(*)                                    AS total_docs,
    COUNT(*) FILTER (WHERE status = 'verified')  AS verified_docs,
    COUNT(*) FILTER (WHERE status = 'pending')   AS pending_docs,
    COUNT(*) FILTER (WHERE status = 'in_review') AS inreview_docs
  FROM globalhire.documents
  GROUP BY applicant_id
) dc ON dc.applicant_id = p.id
WHERE p.role = 'applicant';

DROP VIEW IF EXISTS public.gh_admin_applicant_overview CASCADE;
CREATE VIEW public.gh_admin_applicant_overview AS
SELECT * FROM globalhire.admin_applicant_overview;

GRANT SELECT ON public.gh_admin_applicant_overview TO authenticated;
