-- schema-v38-mp-storage-policy-hardening.sql
-- IMPORTANT FIX (FINAL whole-branch review of Chunk 1, finding 3): schema-v34's storage
-- policies cast the third path segment to ::uuid inside the USING/WITH CHECK clause —
--   ((storage.foldername(name))[3])::uuid IN (SELECT globalhire.my_agency_ids())
-- gh-applicant-documents is a SHARED bucket (schema-v18 already stores
-- recruiter-clients/<uid>/... objects there, alongside applicant-owned paths). Postgres
-- does not guarantee left-to-right evaluation of an AND list, so the planner may run the
-- ::uuid cast on a row whose third path segment isn't a UUID before the earlier
-- bucket/prefix equality checks short-circuit it. Any such row raises 22P02
-- (invalid_text_representation), and because permissive storage.objects policies are
-- OR-combined, ONE throwing policy aborts the whole statement for every authenticated
-- user — breaking document listing for unrelated recruiter and applicant flows, not just
-- marketplace agencies. schema-v18 already established the house pattern for exactly
-- this shared-bucket hazard: compare the path segment AS TEXT, never cast it.
--
-- This migration:
--   1. Drops and recreates all three schema-v34 policies (SELECT/INSERT/UPDATE) comparing
--      (storage.foldername(name))[3] as text against my_agency_ids()::text — no cast on
--      untrusted input, so a non-UUID third segment can never raise mid-scan.
--   2. Adds the missing FOR DELETE policy. schema-v34 granted SELECT/INSERT/UPDATE only,
--      so an agency could never remove a licence/profile file it uploaded by mistake, and
--      js/mp-onboarding.js:113 mints a fresh Date.now() filename on every save — orphans
--      accumulate under marketplace/agency/<id>/ with no cleanup path.
BEGIN;

DROP POLICY IF EXISTS "mp agency members read own agency objects" ON storage.objects;
CREATE POLICY "mp agency members read own agency objects"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'gh-applicant-documents'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = 'agency'
  AND (storage.foldername(name))[3] IN (SELECT globalhire.my_agency_ids()::text)
);

DROP POLICY IF EXISTS "mp agency members write own agency objects" ON storage.objects;
CREATE POLICY "mp agency members write own agency objects"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'gh-applicant-documents'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = 'agency'
  AND (storage.foldername(name))[3] IN (SELECT globalhire.my_agency_ids()::text)
);

DROP POLICY IF EXISTS "mp agency members update own agency objects" ON storage.objects;
CREATE POLICY "mp agency members update own agency objects"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'gh-applicant-documents'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = 'agency'
  AND (storage.foldername(name))[3] IN (SELECT globalhire.my_agency_ids()::text)
);

DROP POLICY IF EXISTS "mp agency members delete own agency objects" ON storage.objects;
CREATE POLICY "mp agency members delete own agency objects"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'gh-applicant-documents'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = 'agency'
  AND (storage.foldername(name))[3] IN (SELECT globalhire.my_agency_ids()::text)
);

COMMIT;
