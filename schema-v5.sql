-- ============================================
-- GLOBALHIRE@ELAB — Schema v5
-- Verification Features: Audit Trail, Registry
-- Checks, AI Analysis, Consistency Scoring
-- ============================================

-- ══════════════════════════════════════════════
-- 1. NEW TABLE: verification_audit
-- Tracks every action taken on documents
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS globalhire.verification_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES globalhire.documents(id) ON DELETE CASCADE,
  admin_id        UUID REFERENCES globalhire.profiles(id),
  action          TEXT NOT NULL CHECK (action IN ('status_change', 'analysis_run', 'registry_check', 'note_added')),
  old_status      TEXT,
  new_status      TEXT,
  method          TEXT DEFAULT 'manual' CHECK (method IN ('manual', 'ai_analysis', 'registry_manual')),
  details         JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verif_audit_document
  ON globalhire.verification_audit(document_id);
CREATE INDEX IF NOT EXISTS idx_verif_audit_admin
  ON globalhire.verification_audit(admin_id);
CREATE INDEX IF NOT EXISTS idx_verif_audit_created
  ON globalhire.verification_audit(created_at DESC);

-- ══════════════════════════════════════════════
-- 2. NEW TABLE: registry_checks
-- Manual registry verification records
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS globalhire.registry_checks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES globalhire.documents(id) ON DELETE CASCADE,
  admin_id        UUID REFERENCES globalhire.profiles(id),
  registry_name   TEXT NOT NULL,
  license_number  TEXT,
  standing        TEXT NOT NULL DEFAULT 'not_found' CHECK (standing IN ('active', 'inactive', 'suspended', 'not_found')),
  verified_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date     DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registry_checks_document
  ON globalhire.registry_checks(document_id);

-- ══════════════════════════════════════════════
-- 3. ALTER documents — add verification columns
-- ══════════════════════════════════════════════
ALTER TABLE globalhire.documents
  ADD COLUMN IF NOT EXISTS verified_by          UUID REFERENCES globalhire.profiles(id),
  ADD COLUMN IF NOT EXISTS verification_method  TEXT DEFAULT 'manual'
    CHECK (verification_method IN ('manual', 'ai_assisted', 'registry_confirmed')),
  ADD COLUMN IF NOT EXISTS authenticity_score   INTEGER CHECK (authenticity_score >= 0 AND authenticity_score <= 100),
  ADD COLUMN IF NOT EXISTS consistency_score    INTEGER CHECK (consistency_score >= 0 AND consistency_score <= 100),
  ADD COLUMN IF NOT EXISTS analysis_results     JSONB;

-- ══════════════════════════════════════════════
-- 4. PUBLIC PROXY VIEWS
-- ══════════════════════════════════════════════

-- Recreate gh_documents to include new columns
DROP VIEW IF EXISTS public.gh_documents CASCADE;
CREATE VIEW public.gh_documents AS
SELECT * FROM globalhire.documents;

-- New view: verification audit
CREATE OR REPLACE VIEW public.gh_verification_audit AS
SELECT * FROM globalhire.verification_audit;

-- New view: registry checks
CREATE OR REPLACE VIEW public.gh_registry_checks AS
SELECT * FROM globalhire.registry_checks;

-- ══════════════════════════════════════════════
-- 5. ROW-LEVEL SECURITY
-- ══════════════════════════════════════════════

-- Enable RLS on new tables
ALTER TABLE globalhire.verification_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.registry_checks ENABLE ROW LEVEL SECURITY;

-- verification_audit policies
CREATE POLICY "Admins can read all audit entries"
  ON globalhire.verification_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert audit entries"
  ON globalhire.verification_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Applicants can read own audit entries"
  ON globalhire.verification_audit FOR SELECT
  TO authenticated
  USING (
    document_id IN (
      SELECT id FROM globalhire.documents
      WHERE applicant_id = auth.uid()
    )
  );

-- registry_checks policies
CREATE POLICY "Admins can read all registry checks"
  ON globalhire.registry_checks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert registry checks"
  ON globalhire.registry_checks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ══════════════════════════════════════════════
-- 6. GRANTS
-- ══════════════════════════════════════════════
GRANT SELECT, INSERT ON globalhire.verification_audit TO authenticated;
GRANT SELECT, INSERT ON globalhire.registry_checks TO authenticated;
GRANT ALL ON public.gh_documents TO authenticated, anon;
GRANT SELECT, INSERT ON public.gh_verification_audit TO authenticated;
GRANT SELECT, INSERT ON public.gh_registry_checks TO authenticated;

-- Service role needs full access for edge functions
GRANT ALL ON globalhire.verification_audit TO service_role;
GRANT ALL ON globalhire.registry_checks TO service_role;
GRANT ALL ON globalhire.documents TO service_role;
