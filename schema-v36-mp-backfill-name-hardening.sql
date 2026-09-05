-- schema-v36-mp-backfill-name-hardening.sql
-- Hardening pass (Task 15 / A2): re-run schema-v33's recruiter→agency backfill with a
-- NULL-safe name expression.
--
-- schema-v33 used COALESCE(NULLIF(p.organization_name,''), p.full_name || ' (agency)').
-- Because `NULL || text` evaluates to NULL in Postgres, a recruiter with both
-- organization_name and full_name empty/NULL would COALESCE to NULL and violate
-- mp_agencies.name NOT NULL, aborting the whole migration. globalhire.profiles.full_name
-- is nullable, and 2 such rows exist today — neither is currently role='recruiter' AND
-- recruiter_approved IS TRUE, which is why the original schema-v33 run succeeded. This
-- migration replaces the backfill with a hardened, still-idempotent version so a future
-- recruiter approval with a blank name never aborts the transaction.
--
-- Same idempotency guard (NOT EXISTS … m.role='owner') and same scoping
-- (p.role='recruiter' AND p.recruiter_approved IS TRUE) as schema-v33. Running this today
-- must insert 0 rows — all 7 eligible recruiters are already backfilled.
BEGIN;

WITH new_agencies AS (
  INSERT INTO globalhire.mp_agencies (name, country, status, verified_at, owner_name, created_by, created_at)
  SELECT
    COALESCE(NULLIF(p.organization_name, ''), NULLIF(p.full_name, '') || ' (agency)', 'Agency ' || p.id::text),
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
