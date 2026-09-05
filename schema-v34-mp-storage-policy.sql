-- schema-v34-mp-storage-policy.sql
-- Agency members can read/write objects only under
--   gh-applicant-documents/marketplace/agency/<agency_id>/...
-- Mirrors the shape of schema-v18-recruiter-storage-policies.sql
-- (DROP IF EXISTS + CREATE, foldername[]-scoped), but tenancy is by
-- globalhire.my_agency_ids() instead of a bare auth.uid() match.
BEGIN;

DROP POLICY IF EXISTS "mp agency members read own agency objects" ON storage.objects;
CREATE POLICY "mp agency members read own agency objects"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'gh-applicant-documents'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = 'agency'
  AND ((storage.foldername(name))[3])::uuid IN (SELECT globalhire.my_agency_ids())
);

DROP POLICY IF EXISTS "mp agency members write own agency objects" ON storage.objects;
CREATE POLICY "mp agency members write own agency objects"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'gh-applicant-documents'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = 'agency'
  AND ((storage.foldername(name))[3])::uuid IN (SELECT globalhire.my_agency_ids())
);

DROP POLICY IF EXISTS "mp agency members update own agency objects" ON storage.objects;
CREATE POLICY "mp agency members update own agency objects"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'gh-applicant-documents'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = 'agency'
  AND ((storage.foldername(name))[3])::uuid IN (SELECT globalhire.my_agency_ids())
);

COMMIT;
