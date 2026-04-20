-- ============================================
-- GLOBALHIRE@ELAB — Schema v10
-- Admin "Merge applicant documents to PDF" feature
-- ============================================

-- 1. merged_documents table
-- One row per applicant. Re-merging upserts on applicant_id (overwrite).
CREATE TABLE IF NOT EXISTS globalhire.merged_documents (
  applicant_id   UUID PRIMARY KEY REFERENCES globalhire.profiles(id) ON DELETE CASCADE,
  file_path      TEXT NOT NULL,
  source_doc_ids UUID[] NOT NULL DEFAULT '{}',
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by   UUID NOT NULL REFERENCES globalhire.profiles(id)
);

ALTER TABLE globalhire.merged_documents ENABLE ROW LEVEL SECURITY;

-- 2. RLS — admin-only
DROP POLICY IF EXISTS "gh_admins_all_merged_docs" ON globalhire.merged_documents;
CREATE POLICY "gh_admins_all_merged_docs"
  ON globalhire.merged_documents
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM globalhire.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM globalhire.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- 3. public.gh_merged_documents view (app queries through gh_* views)
DROP VIEW IF EXISTS public.gh_merged_documents CASCADE;
CREATE VIEW public.gh_merged_documents AS
SELECT * FROM globalhire.merged_documents;

GRANT ALL ON public.gh_merged_documents TO authenticated;
GRANT ALL ON globalhire.merged_documents TO service_role;

-- 4. Storage policies — admins write to the gh-applicant-documents bucket
-- (Existing policies only give admins SELECT, and applicants INSERT to {uid}/...
--  Merged files live at merged/{applicantId}/... so admins need their own
--  INSERT/UPDATE/DELETE. The first folder segment is literal "merged",
--  which never matches an applicant's auth.uid(), so applicant SELECT policy
--  does not grant access to merged files.)

DROP POLICY IF EXISTS "gh_admins_insert_all_files" ON storage.objects;
CREATE POLICY "gh_admins_insert_all_files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'gh-applicant-documents'
    AND EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "gh_admins_update_all_files" ON storage.objects;
CREATE POLICY "gh_admins_update_all_files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'gh-applicant-documents'
    AND EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'gh-applicant-documents'
    AND EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "gh_admins_delete_all_files" ON storage.objects;
CREATE POLICY "gh_admins_delete_all_files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'gh-applicant-documents'
    AND EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
