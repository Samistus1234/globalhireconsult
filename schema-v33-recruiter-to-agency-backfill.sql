-- schema-v33-recruiter-to-agency-backfill.sql
-- One-off: every existing recruiter profile becomes a verified agency + owner membership.
-- Idempotent: skips recruiters that already have an owner membership.
BEGIN;

WITH new_agencies AS (
  INSERT INTO globalhire.mp_agencies (name, country, status, verified_at, owner_name, created_by, created_at)
  SELECT
    COALESCE(NULLIF(p.organization_name, ''), p.full_name || ' (agency)'),
    p.country_of_origin,
    'verified',
    now(),
    p.full_name,
    p.id,
    now()
  FROM globalhire.profiles p
  WHERE p.role = 'recruiter'
    AND p.recruiter_approved IS TRUE
    AND NOT EXISTS (
      SELECT 1 FROM globalhire.mp_agency_members m
      WHERE m.user_id = p.id AND m.role = 'owner'
    )
  RETURNING id AS agency_id, created_by AS user_id
)
INSERT INTO globalhire.mp_agency_members (agency_id, user_id, role, status)
SELECT agency_id, user_id, 'owner', 'active' FROM new_agencies;

COMMIT;
