-- ============================================
-- GLOBALHIRE@ELAB — Schema v18 recruiter storage policies
-- Bucket: gh-applicant-documents (private)
-- Recruiter candidate-document path convention:
--   recruiter-clients/{recruiter_id}/{submission_id}/{doc_type}-{ts}.{ext}
--
-- Gap fixed: the existing gh_applicants_* policies gate on
--   (storage.foldername(name))[1] = auth.uid()::text
-- but recruiter uploads live under recruiter-clients/<uid>/... so
-- foldername[1] is the literal 'recruiter-clients' and every recruiter
-- upload/read/delete was denied. These policies scope a recruiter to
-- their OWN subfolder: foldername[1]='recruiter-clients' AND foldername[2]=uid.
--
-- Admin SELECT for the upcoming review UI is ALREADY covered by the
-- existing bucket-wide policy `gh_admins_read_all_files` (SELECT on
-- bucket_id='gh-applicant-documents' gated by globalhire.profiles.role='admin'),
-- which also matches the recruiter-clients/ prefix — so no admin SELECT
-- policy is added here to avoid duplication. (Admins likewise already have
-- gh_admins_insert/update/delete_all_files over the whole bucket.)
-- ============================================

DROP POLICY IF EXISTS gh_recruiters_upload_client_files ON storage.objects;
CREATE POLICY gh_recruiters_upload_client_files ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gh-applicant-documents'
    AND (storage.foldername(name))[1] = 'recruiter-clients'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS gh_recruiters_select_client_files ON storage.objects;
CREATE POLICY gh_recruiters_select_client_files ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'gh-applicant-documents'
    AND (storage.foldername(name))[1] = 'recruiter-clients'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS gh_recruiters_delete_client_files ON storage.objects;
CREATE POLICY gh_recruiters_delete_client_files ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'gh-applicant-documents'
    AND (storage.foldername(name))[1] = 'recruiter-clients'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- VERIFICATION:
SELECT
  count(*) FILTER (WHERE policyname = 'gh_recruiters_upload_client_files') AS upload_policy,
  count(*) FILTER (WHERE policyname = 'gh_recruiters_select_client_files') AS select_policy,
  count(*) FILTER (WHERE policyname = 'gh_recruiters_delete_client_files') AS delete_policy
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';
-- Expected: 1, 1, 1
