-- ============================================
-- GLOBALHIRE@ELAB — Schema v7
-- Campaign Applications: Apply-now workflow
-- ============================================

-- ══════════════════════════════════════════════
-- 1. NEW TABLE: campaign_applications
-- Tracks applicant self-service applications
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS globalhire.campaign_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES globalhire.campaigns(id) ON DELETE CASCADE,
  applicant_id    UUID NOT NULL REFERENCES globalhire.profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'applied'
                  CHECK (status IN ('applied','screening','interview','offer','placed','rejected','withdrawn')),
  cover_note      TEXT,
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_applications_applicant
  ON globalhire.campaign_applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_applications_campaign
  ON globalhire.campaign_applications(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_applications_status
  ON globalhire.campaign_applications(status);

-- ══════════════════════════════════════════════
-- 2. updated_at TRIGGER
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION globalhire.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaign_applications_updated_at
  ON globalhire.campaign_applications;

CREATE TRIGGER trg_campaign_applications_updated_at
  BEFORE UPDATE ON globalhire.campaign_applications
  FOR EACH ROW
  EXECUTE FUNCTION globalhire.set_updated_at();

-- ══════════════════════════════════════════════
-- 3. PUBLIC PROXY VIEWS
-- ══════════════════════════════════════════════

-- Direct proxy: enables insert/update/delete via PostgREST
CREATE OR REPLACE VIEW public.gh_campaign_applications AS
SELECT * FROM globalhire.campaign_applications;

-- Admin detail view: joins applicant profile + campaign details (read-only)
CREATE OR REPLACE VIEW public.gh_campaign_applications_detail AS
SELECT
  ca.*,
  p.full_name       AS applicant_name,
  p.specialty        AS applicant_specialty,
  p.country_of_origin AS applicant_country,
  p.avatar_initials,
  p.avatar_color_index,
  c.title            AS campaign_title,
  c.employer_name,
  c.destination_country,
  c.salary_display,
  c.visa_sponsored
FROM globalhire.campaign_applications ca
LEFT JOIN globalhire.profiles p ON p.id = ca.applicant_id
LEFT JOIN globalhire.campaigns c ON c.id = ca.campaign_id;

-- Applicant view: campaign details for own applications
CREATE OR REPLACE VIEW public.gh_my_applications AS
SELECT
  ca.id,
  ca.campaign_id,
  ca.applicant_id,
  ca.status,
  ca.cover_note,
  ca.applied_at,
  ca.updated_at,
  c.title            AS campaign_title,
  c.employer_name,
  c.destination_country,
  c.salary_display,
  c.visa_sponsored,
  c.specialty,
  c.positions
FROM globalhire.campaign_applications ca
LEFT JOIN globalhire.campaigns c ON c.id = ca.campaign_id;

-- ══════════════════════════════════════════════
-- 4. ROW-LEVEL SECURITY
-- ══════════════════════════════════════════════
ALTER TABLE globalhire.campaign_applications ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "Admins full access on campaign_applications"
  ON globalhire.campaign_applications FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM globalhire.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM globalhire.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Applicants: read own
CREATE POLICY "Applicants read own applications"
  ON globalhire.campaign_applications FOR SELECT
  TO authenticated
  USING (applicant_id = auth.uid());

-- Applicants: insert own
CREATE POLICY "Applicants insert own applications"
  ON globalhire.campaign_applications FOR INSERT
  TO authenticated
  WITH CHECK (applicant_id = auth.uid());

-- ══════════════════════════════════════════════
-- 5. FIX: campaign_matches write proxy
-- The existing gh_campaign_matches is a joined view (matches+profiles)
-- so PostgREST cannot update through it. This simple proxy allows updates.
-- ══════════════════════════════════════════════
CREATE OR REPLACE VIEW public.gh_campaign_matches_write AS
SELECT * FROM globalhire.campaign_matches;

-- ══════════════════════════════════════════════
-- 6. GRANTS
-- ══════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE, DELETE ON globalhire.campaign_applications TO authenticated;
GRANT ALL ON public.gh_campaign_applications TO authenticated, anon;
GRANT ALL ON public.gh_campaign_applications_detail TO authenticated, anon;
GRANT ALL ON public.gh_my_applications TO authenticated, anon;
GRANT ALL ON public.gh_campaign_matches_write TO authenticated, anon;
GRANT ALL ON globalhire.campaign_applications TO service_role;
