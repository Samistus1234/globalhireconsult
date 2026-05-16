-- ============================================
-- GLOBALHIRE@ELAB — Schema v15
-- Saudi Visa Services foundation
-- Spec: docs/superpowers/specs/2026-05-16-saudi-visa-services-design.md §6.2
-- Run once in Supabase SQL Editor.
-- ============================================

-- ── 1. Enums ──
CREATE TYPE globalhire.visa_type AS ENUM (
  'tourist', 'umrah', 'hajj', 'family_visit', 'family_residence',
  'business', 'work_iqama', 'premium_residency', 'investor_misa',
  'transit', 'domestic_worker'
);

CREATE TYPE globalhire.visa_case_status AS ENUM (
  'lead', 'eligibility_passed', 'deposit_pending',
  'intake_in_review', 'docs_revision',
  'submitted_to_partner', 'partner_processing',
  'approved', 'issued',
  'rejected_intake', 'rejected_partner', 'refunded',
  'stale', 'on_hold'
);

-- ── 2. visa_leads (anonymous wizard captures) ──
CREATE TABLE globalhire.visa_leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN (
    'visit-saudi','go-for-umrah','perform-hajj',
    'bring-my-family','live-with-family','work-in-ksa',
    'hire-a-helper','do-business','live-permanently'
  )),
  suggested_visa  globalhire.visa_type,
  nationality     text,
  sponsor_iqama   text,
  contact_email   text,
  contact_phone   text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  session_id      text,
  passed_eligibility boolean DEFAULT false
);

CREATE INDEX visa_leads_created_idx       ON globalhire.visa_leads (created_at DESC);
CREATE INDEX visa_leads_contact_email_idx ON globalhire.visa_leads (contact_email);
CREATE INDEX visa_leads_utm_campaign_idx  ON globalhire.visa_leads (utm_campaign, created_at DESC);

-- ── 3. visa_cases ──
CREATE TABLE globalhire.visa_cases (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  candidate_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  lead_id                  uuid REFERENCES globalhire.visa_leads(id),
  visa_type                globalhire.visa_type NOT NULL,
  status                   globalhire.visa_case_status NOT NULL DEFAULT 'deposit_pending',
  current_state_changed_at timestamptz NOT NULL DEFAULT now(),
  sponsor_iqama            text,
  sponsor_name             text,
  travel_dates             jsonb,
  estimated_total_usd      numeric(10,2),
  deposit_paid_at          timestamptz,
  balance_invoiced_at      timestamptz,
  partner_reference        text,
  partner_submitted_at     timestamptz,
  issued_at                timestamptz,
  visa_pdf_path            text,
  refund_reason            text
);

CREATE INDEX visa_cases_candidate_idx ON globalhire.visa_cases (candidate_id);
CREATE INDEX visa_cases_status_idx    ON globalhire.visa_cases (status);

-- ── 4. visa_case_documents ──
CREATE TABLE globalhire.visa_case_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL REFERENCES globalhire.visa_cases(id) ON DELETE CASCADE,
  doc_kind      text NOT NULL,
  storage_path  text NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','accepted','rejected')),
  reviewer_note text
);

CREATE INDEX visa_case_documents_case_idx ON globalhire.visa_case_documents (case_id);

-- ── 5. visa_case_events (immutable audit log) ──
-- TODO(P1-T2): enforce immutability via RLS (no UPDATE/DELETE policies).
CREATE TABLE globalhire.visa_case_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL REFERENCES globalhire.visa_cases(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid REFERENCES auth.users(id),
  event_type  text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX visa_case_events_case_idx ON globalhire.visa_case_events (case_id, created_at DESC);

-- ── 6. visa_invoices ──
-- TODO(P1-T2): RLS — service-role-only INSERT/UPDATE; candidate SELECT scoped via case ownership.
CREATE TABLE globalhire.visa_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL REFERENCES globalhire.visa_cases(id) ON DELETE RESTRICT,
  kind          text NOT NULL CHECK (kind IN ('deposit','balance','refund')),
  amount_usd    numeric(10,2) NOT NULL,
  provider      text CHECK (provider IN ('paystack','stripe','bank')),
  provider_ref  text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  paid_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX visa_invoices_case_idx ON globalhire.visa_invoices (case_id);

-- ── 7. partner_submissions ──
CREATE TABLE globalhire.partner_submissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           uuid NOT NULL REFERENCES globalhire.visa_cases(id) ON DELETE CASCADE,
  partner_id        text DEFAULT 'default',  -- forward-compat for v3 multi-partner
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  channel           text NOT NULL CHECK (channel IN ('api','email','portal')),
  request_payload   jsonb NOT NULL,
  response_payload  jsonb,
  partner_reference text
);

CREATE INDEX partner_submissions_case_idx ON globalhire.partner_submissions (case_id);

-- ── 8. updated_at trigger for visa_cases ──
CREATE OR REPLACE FUNCTION globalhire.touch_visa_case_state()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.current_state_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER visa_cases_state_change
  BEFORE UPDATE ON globalhire.visa_cases
  FOR EACH ROW EXECUTE FUNCTION globalhire.touch_visa_case_state();

-- VERIFICATION (run after applying):
SELECT
  (SELECT count(*) FROM pg_type WHERE typname IN ('visa_type','visa_case_status') AND typnamespace = 'globalhire'::regnamespace) AS enums_created,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema = 'globalhire'
       AND table_name IN ('visa_leads','visa_cases','visa_case_documents','visa_case_events','visa_invoices','partner_submissions')) AS tables_created
,(SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'globalhire'
      AND tablename IN ('visa_leads','visa_cases','visa_case_documents','visa_case_events','visa_invoices','partner_submissions')) AS indexes_created;
-- Expected: enums_created=2, tables_created=6, indexes_created>=9
