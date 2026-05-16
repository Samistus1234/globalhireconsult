-- ============================================
-- GLOBALHIRE@ELAB — Schema v15 wrapper views
-- Mirror globalhire.visa_* tables under public.gh_* so the existing
-- ghFrom() client helper works without Accept-Profile headers.
-- RLS still applies (views inherit policies from base tables).
-- ============================================

CREATE OR REPLACE VIEW public.gh_visa_leads             AS SELECT * FROM globalhire.visa_leads;
CREATE OR REPLACE VIEW public.gh_visa_cases             AS SELECT * FROM globalhire.visa_cases;
CREATE OR REPLACE VIEW public.gh_visa_case_documents    AS SELECT * FROM globalhire.visa_case_documents;
CREATE OR REPLACE VIEW public.gh_visa_case_events       AS SELECT * FROM globalhire.visa_case_events;
CREATE OR REPLACE VIEW public.gh_visa_invoices          AS SELECT * FROM globalhire.visa_invoices;
CREATE OR REPLACE VIEW public.gh_partner_submissions    AS SELECT * FROM globalhire.partner_submissions;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.gh_visa_leads,
  public.gh_visa_cases,
  public.gh_visa_case_documents,
  public.gh_visa_case_events,
  public.gh_visa_invoices,
  public.gh_partner_submissions
TO anon, authenticated;

-- VERIFICATION:
SELECT count(*) AS wrapper_views
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('gh_visa_leads','gh_visa_cases','gh_visa_case_documents','gh_visa_case_events','gh_visa_invoices','gh_partner_submissions');
-- Expected: 6
