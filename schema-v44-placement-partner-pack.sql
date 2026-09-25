-- schema-v44-placement-partner-pack.sql
-- Partner pack documents (CAC cert, licence, profile, declarations) kept in a
-- private bucket, listed in a small table so the admin page can link them and
-- the pp-send-intro function can attach them. Also stores the intro-email
-- template as a single-row settings table so copy is editable without a deploy.

INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-pack', 'partner-pack', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE globalhire.placement_partner_pack (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order   int  NOT NULL DEFAULT 0,
  code         text NOT NULL UNIQUE,          -- cac_certificate | recruiter_licence | company_profile | ethical_declaration | data_protection | ...
  title        text NOT NULL,
  file_path    text NOT NULL,                 -- bucket-relative key in partner-pack
  file_name    text NOT NULL,
  file_size_bytes bigint,
  mime_type    text NOT NULL DEFAULT 'application/pdf',
  attach_by_default boolean NOT NULL DEFAULT true,
  status       text NOT NULL DEFAULT 'current' CHECK (status IN ('current','pending','superseded')),
  notes        text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE globalhire.placement_partner_templates (
  code        text PRIMARY KEY,               -- 'intro'
  subject     text NOT NULL,
  body_text   text NOT NULL,                  -- plain text with {{placeholders}}
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE globalhire.placement_partner_pack      ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.placement_partner_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY pp_pack_admin_all ON globalhire.placement_partner_pack
  FOR ALL TO authenticated USING (globalhire.is_admin()) WITH CHECK (globalhire.is_admin());
CREATE POLICY pp_templates_admin_all ON globalhire.placement_partner_templates
  FOR ALL TO authenticated USING (globalhire.is_admin()) WITH CHECK (globalhire.is_admin());

CREATE VIEW public.gh_placement_partner_pack      WITH (security_invoker = true) AS SELECT * FROM globalhire.placement_partner_pack;
CREATE VIEW public.gh_placement_partner_templates WITH (security_invoker = true) AS SELECT * FROM globalhire.placement_partner_templates;

GRANT SELECT, INSERT, UPDATE, DELETE ON globalhire.placement_partner_pack, globalhire.placement_partner_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gh_placement_partner_pack, public.gh_placement_partner_templates TO authenticated;
REVOKE ALL ON public.gh_placement_partner_pack, public.gh_placement_partner_templates FROM anon;

-- Storage: admins read the pack; writes are service-role (seed script).
DROP POLICY IF EXISTS "pp_pack_admin_read" ON storage.objects;
CREATE POLICY "pp_pack_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'partner-pack' AND globalhire.is_admin());

-- Outreach log: remember which email was sent (subject + message id) for audit.
ALTER TABLE globalhire.placement_partner_outreach
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_to text,
  ADD COLUMN IF NOT EXISTS email_message_id text,
  ADD COLUMN IF NOT EXISTS attachments text[];
CREATE OR REPLACE VIEW public.gh_placement_partner_outreach WITH (security_invoker = true) AS
  SELECT * FROM globalhire.placement_partner_outreach;

INSERT INTO globalhire.placement_partner_templates (code, subject, body_text) VALUES ('intro',
'Sourcing partnership — licensed Nigerian healthcare recruiter with DataFlow-verified nurses and doctors',
'Dear {{partner_greeting}},

I''m Samuel Akinjopo, founder of Global Hire Consult Ltd (Federal Ministry of Labour recruiter licence LAB/EW/001637; CAC RC 1949626), the recruitment arm of eLab Solutions.

We prepare and credential African nurses and doctors for international practice — DataFlow primary-source verification, Prometric/SCFHS/DHP licensing, NCLEX, OET/IELTS — and we now have a pipeline of candidates who are fully verified and ready to be placed. We would like to become one of your overseas sourcing partners.

What we bring:
- A pool of 600+ registered healthcare applicants, 185 of them already holding a completed DataFlow report (Saudi Arabia, Qatar, Oman), most with 2+ years'' acute-care experience.
- Full pre-screening on our side: credential verification, English-test status, experience letters, police clearance and interview readiness — you receive document-complete files.
- Ethical recruitment: we charge candidates no placement or job-finding fees and operate in line with the WHO Global Code.{{region_clause}}

{{partner_hook}}

Attached: certificate of incorporation, recruiter licence, company profile, and our ethical-recruitment and data-protection declarations. Membership and reference letters are available on request.

Could we arrange a 20-minute call to discuss your partner terms and onboarding requirements? I am available on weekdays 10:00–17:00 (GMT+3).

Kind regards,
Samuel Akinjopo
Founder, Global Hire Consult Ltd · eLab Solutions
globalhire@elabsolution.org · +234 703 380 9893 · https://globalhire.elabsolution.org');

NOTIFY pgrst, 'reload schema';
