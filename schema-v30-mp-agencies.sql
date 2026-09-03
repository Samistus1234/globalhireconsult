-- schema-v30-mp-agencies.sql
-- Partner Marketplace chunk 1: agency tenant + membership + tenancy helper.

BEGIN;

CREATE TABLE globalhire.mp_agencies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  country               text,
  city                  text,
  address               text,
  website               text,
  year_founded          int,
  owner_name            text,
  services              text[] NOT NULL DEFAULT '{}',
  cooperation_areas     text[] NOT NULL DEFAULT '{}',
  licence_file_path     text,
  company_profile_path  text,
  status                text NOT NULL DEFAULT 'pending_verification'
                          CHECK (status IN ('pending_verification','verified','suspended','rejected')),
  verification_note     text,
  verified_by           uuid,
  verified_at           timestamptz,
  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE globalhire.mp_agency_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid NOT NULL REFERENCES globalhire.mp_agencies(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','removed')),
  invited_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, user_id)
);
CREATE INDEX mp_agency_members_user_idx ON globalhire.mp_agency_members (user_id) WHERE status = 'active';

-- Tenancy helper: the agency_ids the caller is an active member of.
CREATE OR REPLACE FUNCTION globalhire.my_agency_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT agency_id FROM globalhire.mp_agency_members
  WHERE user_id = auth.uid() AND status = 'active';
$$;
REVOKE ALL ON FUNCTION globalhire.my_agency_ids() FROM public;
GRANT EXECUTE ON FUNCTION globalhire.my_agency_ids() TO authenticated;

ALTER TABLE globalhire.mp_agencies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.mp_agency_members  ENABLE ROW LEVEL SECURITY;

-- mp_agencies policies
CREATE POLICY mp_agencies_member_select ON globalhire.mp_agencies
  FOR SELECT TO authenticated
  USING (id IN (SELECT globalhire.my_agency_ids()) OR globalhire.is_admin());

CREATE POLICY mp_agencies_owner_update ON globalhire.mp_agencies
  FOR UPDATE TO authenticated
  USING (id IN (SELECT globalhire.my_agency_ids()) OR globalhire.is_admin())
  WITH CHECK (id IN (SELECT globalhire.my_agency_ids()) OR globalhire.is_admin());

CREATE POLICY mp_agencies_admin_all ON globalhire.mp_agencies
  FOR ALL TO authenticated
  USING (globalhire.is_admin()) WITH CHECK (globalhire.is_admin());
-- NOTE: no authenticated INSERT policy. Rows are created by the mp-agency-register
-- edge function (service role, bypasses RLS). Same rationale as profiles.

-- Column guard: agency members must not self-verify or reassign ownership fields.
CREATE OR REPLACE FUNCTION globalhire.mp_agencies_column_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF globalhire.is_admin() OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verification_note IS DISTINCT FROM OLD.verification_note
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'mp_agencies: protected column change denied for non-admin';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mp_agencies_column_guard_trg
  BEFORE UPDATE ON globalhire.mp_agencies
  FOR EACH ROW EXECUTE FUNCTION globalhire.mp_agencies_column_guard();

-- mp_agency_members policies
CREATE POLICY mp_members_self_or_agency_select ON globalhire.mp_agency_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR agency_id IN (SELECT globalhire.my_agency_ids())
    OR globalhire.is_admin()
  );

CREATE POLICY mp_members_admin_all ON globalhire.mp_agency_members
  FOR ALL TO authenticated
  USING (globalhire.is_admin()) WITH CHECK (globalhire.is_admin());
-- Member INSERT/UPDATE/DELETE by agency owners is done through the
-- mp-agency-invite / mp-agency-invite-accept edge functions (service role).

-- Public wrapper views (security_invoker → RLS above is enforced for the caller)
CREATE VIEW public.gh_mp_agencies        WITH (security_invoker = true) AS
  SELECT * FROM globalhire.mp_agencies;
CREATE VIEW public.gh_mp_agency_members  WITH (security_invoker = true) AS
  SELECT * FROM globalhire.mp_agency_members;

GRANT SELECT, INSERT, UPDATE, DELETE ON globalhire.mp_agencies       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON globalhire.mp_agency_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gh_mp_agencies        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gh_mp_agency_members  TO authenticated;

COMMIT;
