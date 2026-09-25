-- schema-v43-placement-partners.sql
-- Outbound placement partners: overseas recruiters/employers that GlobalHire
-- sends candidates TO (distinct from mp_agencies = inbound sub-agents that
-- refer candidates to eLab). Seeded from the 25 Sep 2026 research set.
-- Admin-only read/write via RLS; outreach log is append-only.

CREATE TABLE globalhire.placement_partners (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  website                  text,
  region                   text NOT NULL,           -- USA | Canada | Australia/NZ | UK/Ireland | GCC
  hq_country               text,
  professions              text,
  source_countries         text,
  accepts_african          text,                    -- free text from research (yes/no/unclear + evidence)
  visa_model               text,
  partner_program          text,                    -- yes | no | unclear (+ qualifier)
  partner_program_url      text,
  registration_method      text,
  required_docs            text,
  contact_email            text,
  contact_form_url         text,
  candidate_requirements   text,
  ethical_cert             text,
  priority                 text NOT NULL DEFAULT 'B' CHECK (priority IN ('A','B','C')),
  research_notes           text,
  evidence_urls            text[] DEFAULT '{}',
  -- outreach tracking
  outreach_status          text NOT NULL DEFAULT 'not_contacted'
    CHECK (outreach_status IN ('not_contacted','contacted','registered','docs_submitted','agreement_signed','active','declined','not_eligible')),
  last_contact_at          timestamptz,
  next_action              text,
  next_action_due          date,
  owner_user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  internal_notes           text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX placement_partners_region_idx   ON globalhire.placement_partners (region);
CREATE INDEX placement_partners_status_idx   ON globalhire.placement_partners (outreach_status);
CREATE INDEX placement_partners_priority_idx ON globalhire.placement_partners (priority);

CREATE TABLE globalhire.placement_partner_outreach (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id   uuid NOT NULL REFERENCES globalhire.placement_partners(id) ON DELETE CASCADE,
  channel      text NOT NULL CHECK (channel IN ('email','form','portal','phone','whatsapp','linkedin','meeting','other')),
  direction    text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  summary      text NOT NULL CHECK (char_length(btrim(summary)) > 0),
  status_after text,                                 -- outreach_status the partner moved to (nullable)
  logged_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX placement_partner_outreach_partner_idx ON globalhire.placement_partner_outreach (partner_id, occurred_at DESC);

-- updated_at maintenance
CREATE OR REPLACE FUNCTION globalhire.placement_partners_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
CREATE TRIGGER placement_partners_touch_trg
  BEFORE UPDATE ON globalhire.placement_partners
  FOR EACH ROW EXECUTE FUNCTION globalhire.placement_partners_touch();

-- Logging an outreach entry with status_after moves the partner's status and
-- stamps last_contact_at, so the list and the log can never disagree.
CREATE OR REPLACE FUNCTION globalhire.placement_partner_outreach_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE globalhire.placement_partners
     SET last_contact_at = GREATEST(COALESCE(last_contact_at, NEW.occurred_at), NEW.occurred_at),
         outreach_status = COALESCE(NEW.status_after, outreach_status)
   WHERE id = NEW.partner_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER placement_partner_outreach_apply_trg
  AFTER INSERT ON globalhire.placement_partner_outreach
  FOR EACH ROW EXECUTE FUNCTION globalhire.placement_partner_outreach_apply();

-- RLS: admin only
ALTER TABLE globalhire.placement_partners         ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.placement_partner_outreach ENABLE ROW LEVEL SECURITY;

CREATE POLICY placement_partners_admin_all ON globalhire.placement_partners
  FOR ALL TO authenticated
  USING (globalhire.is_admin()) WITH CHECK (globalhire.is_admin());

CREATE POLICY placement_partner_outreach_admin_all ON globalhire.placement_partner_outreach
  FOR ALL TO authenticated
  USING (globalhire.is_admin()) WITH CHECK (globalhire.is_admin());

-- Public wrapper views (security_invoker → RLS enforced for the caller)
CREATE VIEW public.gh_placement_partners WITH (security_invoker = true) AS
  SELECT * FROM globalhire.placement_partners;
CREATE VIEW public.gh_placement_partner_outreach WITH (security_invoker = true) AS
  SELECT * FROM globalhire.placement_partner_outreach;

-- Per-region counters for the dashboard header
CREATE VIEW public.gh_placement_partner_stats WITH (security_invoker = true) AS
  SELECT region,
         count(*)                                                    AS total,
         count(*) FILTER (WHERE priority = 'A')                      AS priority_a,
         count(*) FILTER (WHERE outreach_status <> 'not_contacted')  AS contacted,
         count(*) FILTER (WHERE outreach_status IN ('registered','docs_submitted','agreement_signed','active')) AS registered,
         count(*) FILTER (WHERE outreach_status = 'active')          AS active,
         count(*) FILTER (WHERE outreach_status IN ('declined','not_eligible')) AS closed
    FROM globalhire.placement_partners
   GROUP BY region;

REVOKE ALL ON public.gh_placement_partners, public.gh_placement_partner_outreach, public.gh_placement_partner_stats FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON globalhire.placement_partners          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON globalhire.placement_partner_outreach  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gh_placement_partners           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gh_placement_partner_outreach   TO authenticated;
GRANT SELECT ON public.gh_placement_partner_stats TO authenticated;

NOTIFY pgrst, 'reload schema';
