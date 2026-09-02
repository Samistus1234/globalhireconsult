-- ============================================
-- GLOBALHIRE@ELAB — Schema v29
-- Public read of ACTIVE campaigns (anon + authenticated)
-- Run in the Supabase SQL editor for project evzhnsugmvtqgmvzwyix.
-- ============================================
-- Why: public.gh_campaigns was flipped to SECURITY_INVOKER in v24, but anon
-- (and authenticated non-admins) have no SELECT grant on globalhire.campaigns
-- and no matching read policy — only the admin FOR ALL policy exists (v3).
-- Result: jobs board / home "Latest Openings" campaign fetches return nothing
-- for anon. This migration lets any visitor read campaigns whose status is
-- 'active' (open to the public), while draft/matching/review/sending/closed
-- stay internal. Re-runnable (idempotent).
-- ============================================

begin;

-- Table-level SELECT for anon + authenticated so the invoker view can resolve.
GRANT SELECT ON globalhire.campaigns TO anon, authenticated;

-- Row-level: only ACTIVE campaigns are public.
DROP POLICY IF EXISTS "gh_public_read_active_campaigns" ON globalhire.campaigns;
CREATE POLICY "gh_public_read_active_campaigns"
  ON globalhire.campaigns FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

commit;

-- ── VERIFICATION (run in SQL editor after apply) ──────────────
-- SELECT has_table_privilege('anon', 'globalhire.campaigns', 'SELECT') AS anon_can_select;
-- SELECT status, count(*) FROM globalhire.campaigns GROUP BY status ORDER BY status;
-- SELECT id, title, status FROM globalhire.campaigns WHERE status = 'active' ORDER BY created_at DESC;
