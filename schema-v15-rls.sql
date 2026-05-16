-- ============================================
-- GLOBALHIRE@ELAB — Schema v15 RLS policies
-- Spec: §6.2 (RLS-scoped to candidate or admin role)
-- ============================================

-- Enable RLS on all visa tables
ALTER TABLE globalhire.visa_leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.visa_cases             ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.visa_case_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.visa_case_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.visa_invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.partner_submissions    ENABLE ROW LEVEL SECURITY;

-- Helper: is the caller a globalhire admin?
-- Reuses existing globalhire.profiles.is_admin column (already in schema).
CREATE OR REPLACE FUNCTION globalhire.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE((SELECT is_admin FROM globalhire.profiles WHERE id = auth.uid()), false);
$$;

-- ── visa_leads ──
-- Anyone (including anon) may insert a lead (the wizard captures pre-auth).
-- Only admins may read leads (PII).
CREATE POLICY visa_leads_anon_insert ON globalhire.visa_leads
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY visa_leads_admin_select ON globalhire.visa_leads
  FOR SELECT TO authenticated USING (globalhire.is_admin());

-- ── visa_cases ──
-- Candidates see their own cases; admins see all.
CREATE POLICY visa_cases_owner_select ON globalhire.visa_cases
  FOR SELECT TO authenticated USING (candidate_id = auth.uid() OR globalhire.is_admin());

-- Inserts only via service role (edge function); deny direct client inserts.
-- (No policy = denied for non-service roles.)

-- Updates only via service role.

-- ── visa_case_documents ──
CREATE POLICY visa_case_documents_owner_select ON globalhire.visa_case_documents
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM globalhire.visa_cases c
              WHERE c.id = case_id AND (c.candidate_id = auth.uid() OR globalhire.is_admin()))
  );

CREATE POLICY visa_case_documents_owner_insert ON globalhire.visa_case_documents
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM globalhire.visa_cases c
              WHERE c.id = case_id AND c.candidate_id = auth.uid())
  );

-- ── visa_case_events ──
CREATE POLICY visa_case_events_owner_select ON globalhire.visa_case_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM globalhire.visa_cases c
              WHERE c.id = case_id AND (c.candidate_id = auth.uid() OR globalhire.is_admin()))
  );
-- Insert: service role only

-- ── visa_invoices ──
CREATE POLICY visa_invoices_owner_select ON globalhire.visa_invoices
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM globalhire.visa_cases c
              WHERE c.id = case_id AND (c.candidate_id = auth.uid() OR globalhire.is_admin()))
  );
-- Insert / update: service role only

-- ── partner_submissions ──
CREATE POLICY partner_submissions_admin_select ON globalhire.partner_submissions
  FOR SELECT TO authenticated USING (globalhire.is_admin());
-- Insert: service role only

-- VERIFICATION:
SELECT count(*) AS policies_created
FROM pg_policies
WHERE schemaname = 'globalhire'
  AND tablename IN ('visa_leads','visa_cases','visa_case_documents','visa_case_events','visa_invoices','partner_submissions');
-- Expected: 8
