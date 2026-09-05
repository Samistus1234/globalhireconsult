-- schema-v31-mp-agency-invites.sql
BEGIN;

CREATE TABLE globalhire.mp_agency_invites (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         uuid NOT NULL REFERENCES globalhire.mp_agencies(id) ON DELETE CASCADE,
  email             text NOT NULL,
  role              text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  token             text NOT NULL UNIQUE,
  invited_by        uuid NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at        timestamptz NOT NULL,
  accepted_at       timestamptz,
  accepted_user_id  uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mp_agency_invites_agency_idx ON globalhire.mp_agency_invites (agency_id);
CREATE INDEX mp_agency_invites_email_idx  ON globalhire.mp_agency_invites (lower(email)) WHERE status = 'pending';

ALTER TABLE globalhire.mp_agency_invites ENABLE ROW LEVEL SECURITY;

-- Members of the inviting agency can see its invites; the invitee can see their own by email; admin all.
-- NOTE: invitee email match uses auth.email() (the JWT email claim). A subquery against
-- auth.users would raise 42501 for the `authenticated` role, which has no SELECT on that table.
CREATE POLICY mp_invites_agency_or_invitee_select ON globalhire.mp_agency_invites
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT globalhire.my_agency_ids())
    OR lower(email) = lower(auth.email())
    OR globalhire.is_admin()
  );

CREATE POLICY mp_invites_admin_all ON globalhire.mp_agency_invites
  FOR ALL TO authenticated
  USING (globalhire.is_admin()) WITH CHECK (globalhire.is_admin());
-- Writes (create/revoke/accept) go through the mp-agency-invite* edge functions (service role).

CREATE VIEW public.gh_mp_agency_invites WITH (security_invoker = true) AS
  SELECT id, agency_id, email, role, status, expires_at, accepted_at, created_at
  FROM globalhire.mp_agency_invites;
-- NOTE: the view deliberately omits `token` — it is never needed client-side
-- (accept happens via the emailed link → edge fn).

GRANT SELECT, INSERT, UPDATE, DELETE ON globalhire.mp_agency_invites TO authenticated;
GRANT SELECT ON public.gh_mp_agency_invites TO authenticated;

COMMIT;
