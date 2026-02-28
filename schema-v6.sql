-- ============================================
-- GLOBALHIRE@ELAB — Schema v6
-- Placement Lifecycle: Placements, Contracts,
-- Activities, Onboarding Checklist
-- ============================================

-- ══════════════════════════════════════════════
-- 1. NEW TABLE: placements
-- Core placement record linking campaign match
-- to a full lifecycle
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS globalhire.placements (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                UUID UNIQUE REFERENCES globalhire.campaign_matches(id) ON DELETE SET NULL,
  applicant_id            UUID NOT NULL REFERENCES globalhire.profiles(id),
  campaign_id             UUID REFERENCES globalhire.campaigns(id),
  stage                   TEXT NOT NULL DEFAULT 'offer_extended'
    CHECK (stage IN ('offer_extended','offer_accepted','visa_processing','contract','onboarding','active','completed','terminated')),
  visa_status             TEXT NOT NULL DEFAULT 'not_started'
    CHECK (visa_status IN ('not_started','documents_submitted','in_review','approved','denied','not_required')),
  visa_type               TEXT,
  visa_application_date   DATE,
  visa_approval_date      DATE,
  visa_notes              TEXT,
  contract_status         TEXT NOT NULL DEFAULT 'not_started'
    CHECK (contract_status IN ('not_started','draft','sent','signed','countersigned')),
  contract_sent_at        TIMESTAMPTZ,
  contract_signed_at      TIMESTAMPTZ,
  start_date              DATE,
  end_date                DATE,
  expected_duration_months INTEGER,
  termination_reason      TEXT,
  termination_notes       TEXT,
  terminated_at           TIMESTAMPTZ,
  destination_country     TEXT,
  employer_name           TEXT,
  position_title          TEXT,
  salary_display          TEXT,
  notes                   TEXT,
  created_by              UUID REFERENCES globalhire.profiles(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_placements_applicant
  ON globalhire.placements(applicant_id);
CREATE INDEX IF NOT EXISTS idx_placements_campaign
  ON globalhire.placements(campaign_id);
CREATE INDEX IF NOT EXISTS idx_placements_stage
  ON globalhire.placements(stage);
CREATE INDEX IF NOT EXISTS idx_placements_match
  ON globalhire.placements(match_id);

-- ══════════════════════════════════════════════
-- 2. NEW TABLE: placement_contracts
-- File tracking for uploaded contracts
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS globalhire.placement_contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id    UUID NOT NULL REFERENCES globalhire.placements(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type       TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  contract_type   TEXT NOT NULL DEFAULT 'employment'
    CHECK (contract_type IN ('employment','offer_letter','addendum','nda','other')),
  uploaded_by     UUID REFERENCES globalhire.profiles(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_placement_contracts_placement
  ON globalhire.placement_contracts(placement_id);

-- ══════════════════════════════════════════════
-- 3. NEW TABLE: placement_activities
-- Audit trail for every placement event
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS globalhire.placement_activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id    UUID NOT NULL REFERENCES globalhire.placements(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL
    CHECK (event_type IN ('created','stage_changed','visa_updated','contract_uploaded','contract_status_changed','checklist_item_added','checklist_item_completed','note_added','terminated','completed')),
  old_value       TEXT,
  new_value       TEXT,
  details         JSONB DEFAULT '{}'::jsonb,
  actor_id        UUID REFERENCES globalhire.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_placement_activities_placement
  ON globalhire.placement_activities(placement_id);
CREATE INDEX IF NOT EXISTS idx_placement_activities_created
  ON globalhire.placement_activities(created_at DESC);

-- ══════════════════════════════════════════════
-- 4. NEW TABLE: placement_checklist
-- Onboarding checklist items per placement
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS globalhire.placement_checklist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id    UUID NOT NULL REFERENCES globalhire.placements(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('pre_departure','arrival','documentation','orientation','general')),
  is_completed    BOOLEAN NOT NULL DEFAULT false,
  completed_at    TIMESTAMPTZ,
  completed_by    UUID REFERENCES globalhire.profiles(id),
  due_date        DATE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_placement_checklist_placement
  ON globalhire.placement_checklist(placement_id);

-- ══════════════════════════════════════════════
-- 5. PUBLIC PROXY VIEWS
-- ══════════════════════════════════════════════

-- gh_placements: joins profiles, campaign_matches, campaigns
CREATE OR REPLACE VIEW public.gh_placements AS
SELECT
  p.*,
  pr.full_name AS applicant_name,
  pr.avatar_initials,
  pr.avatar_color_index,
  cm.match_score,
  c.title AS campaign_title
FROM globalhire.placements p
LEFT JOIN globalhire.profiles pr ON pr.id = p.applicant_id
LEFT JOIN globalhire.campaign_matches cm ON cm.id = p.match_id
LEFT JOIN globalhire.campaigns c ON c.id = p.campaign_id;

-- gh_placement_contracts: direct proxy
CREATE OR REPLACE VIEW public.gh_placement_contracts AS
SELECT * FROM globalhire.placement_contracts;

-- gh_placement_activities: direct proxy
CREATE OR REPLACE VIEW public.gh_placement_activities AS
SELECT * FROM globalhire.placement_activities;

-- gh_placement_checklist: direct proxy
CREATE OR REPLACE VIEW public.gh_placement_checklist AS
SELECT * FROM globalhire.placement_checklist;

-- gh_my_placements: applicant-facing, limited columns
CREATE OR REPLACE VIEW public.gh_my_placements AS
SELECT
  p.id,
  p.match_id,
  p.applicant_id,
  p.campaign_id,
  p.stage,
  p.visa_status,
  p.visa_type,
  p.contract_status,
  p.start_date,
  p.end_date,
  p.destination_country,
  p.employer_name,
  p.position_title,
  p.salary_display,
  p.created_at,
  p.updated_at,
  c.title AS campaign_title
FROM globalhire.placements p
LEFT JOIN globalhire.campaigns c ON c.id = p.campaign_id;

-- ══════════════════════════════════════════════
-- 6. ROW-LEVEL SECURITY
-- ══════════════════════════════════════════════

ALTER TABLE globalhire.placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.placement_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.placement_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.placement_checklist ENABLE ROW LEVEL SECURITY;

-- ── Placements policies ──
CREATE POLICY "Admins full access on placements"
  ON globalhire.placements FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM globalhire.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM globalhire.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Applicants read own placements"
  ON globalhire.placements FOR SELECT
  TO authenticated
  USING (applicant_id = auth.uid());

-- ── Placement contracts policies ──
CREATE POLICY "Admins full access on placement_contracts"
  ON globalhire.placement_contracts FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM globalhire.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM globalhire.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Applicants read own placement contracts"
  ON globalhire.placement_contracts FOR SELECT
  TO authenticated
  USING (
    placement_id IN (
      SELECT id FROM globalhire.placements WHERE applicant_id = auth.uid()
    )
  );

-- ── Placement activities policies ──
CREATE POLICY "Admins full access on placement_activities"
  ON globalhire.placement_activities FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM globalhire.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM globalhire.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Applicants read own placement activities"
  ON globalhire.placement_activities FOR SELECT
  TO authenticated
  USING (
    placement_id IN (
      SELECT id FROM globalhire.placements WHERE applicant_id = auth.uid()
    )
  );

-- ── Placement checklist policies ──
CREATE POLICY "Admins full access on placement_checklist"
  ON globalhire.placement_checklist FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM globalhire.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM globalhire.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Applicants read own checklist items"
  ON globalhire.placement_checklist FOR SELECT
  TO authenticated
  USING (
    placement_id IN (
      SELECT id FROM globalhire.placements WHERE applicant_id = auth.uid()
    )
  );

CREATE POLICY "Applicants update own checklist items"
  ON globalhire.placement_checklist FOR UPDATE
  TO authenticated
  USING (
    placement_id IN (
      SELECT id FROM globalhire.placements WHERE applicant_id = auth.uid()
    )
  )
  WITH CHECK (
    placement_id IN (
      SELECT id FROM globalhire.placements WHERE applicant_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════
-- 7. GRANTS
-- ══════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE, DELETE ON globalhire.placements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON globalhire.placement_contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON globalhire.placement_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON globalhire.placement_checklist TO authenticated;

GRANT ALL ON public.gh_placements TO authenticated, anon;
GRANT ALL ON public.gh_placement_contracts TO authenticated, anon;
GRANT ALL ON public.gh_placement_activities TO authenticated, anon;
GRANT ALL ON public.gh_placement_checklist TO authenticated, anon;
GRANT ALL ON public.gh_my_placements TO authenticated, anon;

GRANT ALL ON globalhire.placements TO service_role;
GRANT ALL ON globalhire.placement_contracts TO service_role;
GRANT ALL ON globalhire.placement_activities TO service_role;
GRANT ALL ON globalhire.placement_checklist TO service_role;

-- ══════════════════════════════════════════════
-- 8. STORAGE BUCKET: gh-placement-contracts
-- 20MB limit, PDF/DOC/DOCX/JPEG/PNG
-- Path: {placement_id}/{filename}
-- ══════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gh-placement-contracts',
  'gh-placement-contracts',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Admins: upload/read/delete
CREATE POLICY "Admins upload placement contracts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'gh-placement-contracts'
    AND EXISTS (SELECT 1 FROM globalhire.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins read placement contracts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'gh-placement-contracts'
    AND EXISTS (SELECT 1 FROM globalhire.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins delete placement contracts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'gh-placement-contracts'
    AND EXISTS (SELECT 1 FROM globalhire.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Applicants: read own (via placement_id folder matching)
CREATE POLICY "Applicants read own placement contracts storage"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'gh-placement-contracts'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM globalhire.placements WHERE applicant_id = auth.uid()
    )
  );
