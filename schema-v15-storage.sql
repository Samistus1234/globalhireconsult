-- ============================================
-- GLOBALHIRE@ELAB — Schema v15 storage bucket
-- visa-documents: private bucket, owner-scoped paths.
-- Path convention: {candidate_id}/{case_id}/{doc_kind}/{filename}
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'visa-documents', 'visa-documents', false,
  20 * 1024 * 1024,    -- 20 MB max
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Owner uploads: candidate_id is the first path segment
CREATE POLICY visa_docs_owner_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'visa-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Owner reads their own; admins read all
CREATE POLICY visa_docs_owner_or_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'visa-documents'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR globalhire.is_admin())
  );

-- Owner deletes their own (pre-submission only — admin gates after)
CREATE POLICY visa_docs_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'visa-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admins can delete (e.g., reject a doc)
CREATE POLICY visa_docs_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'visa-documents'
    AND globalhire.is_admin()
  );

-- VERIFICATION:
SELECT id, name, public FROM storage.buckets WHERE id = 'visa-documents';
SELECT count(*) AS storage_policies FROM storage.policies WHERE bucket_id = 'visa-documents';
