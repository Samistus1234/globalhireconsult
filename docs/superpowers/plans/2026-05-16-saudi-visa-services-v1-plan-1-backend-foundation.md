# Saudi Visa Services v1 — Plan 1: Backend Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the database + shared-code foundation that every subsequent plan depends on — schema with RLS, storage bucket, TypeScript types, and a Deno test setup so future edge functions can be unit-tested.

**Architecture:** GlobalHire's Supabase project gets a new `globalhire.visa_*` family of tables (RLS-scoped to candidate or admin), a `visa-documents` storage bucket, and a shared `_shared/` module of TypeScript types + eligibility rules consumed by all visa edge functions in plans 2–4. Schema is applied via the existing `schema-vNN.sql` convention (run by hand in Supabase SQL Editor).

**Tech Stack:** PostgreSQL (Supabase), Deno (edge functions), TypeScript.

**Spec reference:** `docs/superpowers/specs/2026-05-16-saudi-visa-services-design.md` §6 (Backend, Schema & Data Flow).

---

## File Structure

| File | Responsibility |
|---|---|
| `schema-v15.sql` | Visa enums, 6 new tables, RLS policies, storage bucket — all in one runnable file |
| `supabase/functions/_shared/visa-types.ts` | TypeScript mirror of the SQL enums + table row interfaces |
| `supabase/functions/_shared/visa-eligibility-rules.ts` | Rule sets per visa type (used by `check-visa-eligibility` in Plan 2) |
| `supabase/functions/deno.json` | Deno workspace config with `test` task + import map |
| `supabase/functions/_shared/visa-eligibility-rules_test.ts` | Unit tests for the rule runner |
| `schema-v15-wrapper-views.sql` | `public.gh_visa_*` views so the existing `ghFrom()` client helper works without `Accept-Profile` headers |
| `docs/visa-services-tooling.md` | One-pager: how to run schema migrations + Deno tests |

---

### Task 1: Schema migration — enums + tables

**Files:**
- Create: `schema-v15.sql`

- [ ] **Step 1: Write the verification query (will go in a comment block at the bottom of the file)**

This is our "test" — after running the migration, this query confirms every artifact exists.

```sql
-- VERIFICATION (run in Supabase SQL Editor after applying):
SELECT
  (SELECT count(*) FROM pg_type WHERE typname IN ('visa_type','visa_case_status') AND typnamespace = 'globalhire'::regnamespace) AS enums_created,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema = 'globalhire'
       AND table_name IN ('visa_leads','visa_cases','visa_case_documents','visa_case_events','visa_invoices','partner_submissions')) AS tables_created;
-- Expected: enums_created=2, tables_created=6
```

- [ ] **Step 2: Write the migration file**

```sql
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
  outcome         text NOT NULL,
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
       AND table_name IN ('visa_leads','visa_cases','visa_case_documents','visa_case_events','visa_invoices','partner_submissions')) AS tables_created;
-- Expected: enums_created=2, tables_created=6
```

- [ ] **Step 3: Apply the migration in Supabase SQL Editor (manual)**

Open the GlobalHire Supabase project → SQL Editor → paste contents of `schema-v15.sql` → Run.

- [ ] **Step 4: Run the verification query**

In SQL Editor:

```sql
SELECT
  (SELECT count(*) FROM pg_type WHERE typname IN ('visa_type','visa_case_status') AND typnamespace = 'globalhire'::regnamespace) AS enums_created,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema = 'globalhire'
       AND table_name IN ('visa_leads','visa_cases','visa_case_documents','visa_case_events','visa_invoices','partner_submissions')) AS tables_created;
```

Expected: `enums_created = 2`, `tables_created = 6`. If not, fix the migration and re-run.

- [ ] **Step 5: Commit**

```bash
git add schema-v15.sql
git commit -m "feat(schema): v15 — visa services enums, tables, indexes"
```

---

### Task 2: Row-Level Security policies

**Files:**
- Create: `schema-v15-rls.sql`

- [ ] **Step 1: Write the verification query**

```sql
-- VERIFICATION:
SELECT count(*) AS policies_created
FROM pg_policies
WHERE schemaname = 'globalhire'
  AND tablename IN ('visa_leads','visa_cases','visa_case_documents','visa_case_events','visa_invoices','partner_submissions');
-- Expected: 11 (see policy count below)
```

- [ ] **Step 2: Write the RLS file**

```sql
-- ============================================
-- GLOBALHIRE@ELAB — Schema v15 RLS policies
-- Spec: §6.2 (RLS-scoped to candidate or admin role)
-- ============================================

-- Enable RLS on all visa tables
ALTER TABLE globalhire.visa_leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.visa_cases             ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.visa_case_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.visa_case_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.visa_invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.partner_submissions    ENABLE ROW LEVEL SECURITY;

-- Helper: is the caller a globalhire admin?
-- Reuses existing globalhire.profiles.is_admin column (already in schema).
CREATE OR REPLACE FUNCTION globalhire.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE((SELECT is_admin FROM globalhire.profiles WHERE id = auth.uid()), false);
$$;

-- ── visa_leads ──
-- Anyone (including anon) may insert a lead (the wizard captures pre-auth).
-- Only admins may read leads (PII).
CREATE POLICY visa_leads_anon_insert ON globalhire.visa_leads
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY visa_leads_admin_select ON globalhire.visa_leads
  FOR SELECT TO authenticated USING (globalhire.is_admin());

-- ── visa_cases ──
-- Candidates see their own cases; admins see all.
CREATE POLICY visa_cases_owner_select ON globalhire.visa_cases
  FOR SELECT TO authenticated USING (candidate_id = auth.uid() OR globalhire.is_admin());

-- Inserts only via service role (edge function); deny direct client inserts.
-- (No policy = denied for non-service roles.)

-- Updates only via service role.

-- ── visa_case_documents ──
CREATE POLICY visa_case_documents_owner_select ON globalhire.visa_case_documents
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM globalhire.visa_cases c
              WHERE c.id = case_id AND (c.candidate_id = auth.uid() OR globalhire.is_admin()))
  );

CREATE POLICY visa_case_documents_owner_insert ON globalhire.visa_case_documents
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM globalhire.visa_cases c
              WHERE c.id = case_id AND c.candidate_id = auth.uid())
  );

-- ── visa_case_events ──
CREATE POLICY visa_case_events_owner_select ON globalhire.visa_case_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM globalhire.visa_cases c
              WHERE c.id = case_id AND (c.candidate_id = auth.uid() OR globalhire.is_admin()))
  );
-- Insert: service role only

-- ── visa_invoices ──
CREATE POLICY visa_invoices_owner_select ON globalhire.visa_invoices
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM globalhire.visa_cases c
              WHERE c.id = case_id AND (c.candidate_id = auth.uid() OR globalhire.is_admin()))
  );
-- Insert / update: service role only

-- ── partner_submissions ──
CREATE POLICY partner_submissions_admin_select ON globalhire.partner_submissions
  FOR SELECT TO authenticated USING (globalhire.is_admin());
-- Insert: service role only

-- VERIFICATION:
SELECT count(*) AS policies_created
FROM pg_policies
WHERE schemaname = 'globalhire'
  AND tablename IN ('visa_leads','visa_cases','visa_case_documents','visa_case_events','visa_invoices','partner_submissions');
-- Expected: 8
```

- [ ] **Step 3: Apply in Supabase SQL Editor**

Paste `schema-v15-rls.sql` → Run.

- [ ] **Step 4: Run verification — expect `policies_created = 8`**

- [ ] **Step 5: Smoke-test as anonymous user**

In SQL Editor under "Run as anon":

```sql
INSERT INTO globalhire.visa_leads (outcome, suggested_visa) VALUES ('test', 'tourist');
-- Expected: success (anon may insert)

SELECT * FROM globalhire.visa_leads LIMIT 1;
-- Expected: 0 rows (anon may not select)

SELECT * FROM globalhire.visa_cases LIMIT 1;
-- Expected: 0 rows

DELETE FROM globalhire.visa_leads WHERE outcome = 'test';
-- (run as service_role to clean up)
```

- [ ] **Step 6: Commit**

```bash
git add schema-v15-rls.sql
git commit -m "feat(schema): v15 RLS — visa tables scoped to owner or admin"
```

---

### Task 3: Storage bucket for visa documents

**Files:**
- Create: `schema-v15-storage.sql`

- [ ] **Step 1: Write the verification query**

```sql
-- VERIFICATION:
SELECT id, name, public FROM storage.buckets WHERE id = 'visa-documents';
-- Expected: one row, public=false

SELECT count(*) AS storage_policies
FROM storage.policies
WHERE bucket_id = 'visa-documents';
-- Expected: 4
```

- [ ] **Step 2: Write the storage migration**

```sql
-- ============================================
-- GLOBALHIRE@ELAB — Schema v15 storage bucket
-- visa-documents: private bucket, owner-scoped paths.
-- Path convention: {candidate_id}/{case_id}/{doc_kind}/{filename}
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'visa-documents', 'visa-documents', false,
  20 * 1024 * 1024,    -- 20 MB max
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Owner uploads: candidate_id is the first path segment
CREATE POLICY visa_docs_owner_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'visa-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Owner reads their own; admins read all
CREATE POLICY visa_docs_owner_or_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'visa-documents'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR globalhire.is_admin())
  );

-- Owner deletes their own (pre-submission only — admin gates after)
CREATE POLICY visa_docs_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'visa-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admins can delete (e.g., reject a doc)
CREATE POLICY visa_docs_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'visa-documents'
    AND globalhire.is_admin()
  );

-- VERIFICATION:
SELECT id, name, public FROM storage.buckets WHERE id = 'visa-documents';
SELECT count(*) AS storage_policies FROM storage.policies WHERE bucket_id = 'visa-documents';
```

- [ ] **Step 3: Apply in Supabase SQL Editor**

- [ ] **Step 4: Verify — expect bucket row + `storage_policies = 4`**

- [ ] **Step 5: Commit**

```bash
git add schema-v15-storage.sql
git commit -m "feat(storage): visa-documents bucket with owner-scoped policies"
```

---

### Task 4: Shared TypeScript types

**Files:**
- Create: `supabase/functions/_shared/visa-types.ts`

- [ ] **Step 1: Write the file**

```typescript
// supabase/functions/_shared/visa-types.ts
// TypeScript mirror of globalhire visa enums + table row shapes.
// Imported by all visa-related edge functions.

export type VisaType =
  | 'tourist'
  | 'umrah'
  | 'hajj'
  | 'family_visit'
  | 'family_residence'
  | 'business'
  | 'work_iqama'
  | 'premium_residency'
  | 'investor_misa'
  | 'transit'
  | 'domestic_worker';

export const V1_VISA_TYPES: VisaType[] = [
  'tourist', 'umrah', 'family_visit', 'family_residence',
];

export type VisaCaseStatus =
  | 'lead'
  | 'eligibility_passed'
  | 'deposit_pending'
  | 'intake_in_review'
  | 'docs_revision'
  | 'submitted_to_partner'
  | 'partner_processing'
  | 'approved'
  | 'issued'
  | 'rejected_intake'
  | 'rejected_partner'
  | 'refunded'
  | 'stale'
  | 'on_hold';

export interface VisaLead {
  id: string;
  created_at: string;
  outcome: string;
  suggested_visa: VisaType | null;
  nationality: string | null;
  sponsor_iqama: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  session_id: string | null;
  passed_eligibility: boolean;
}

export interface VisaCase {
  id: string;
  created_at: string;
  candidate_id: string;
  lead_id: string | null;
  visa_type: VisaType;
  status: VisaCaseStatus;
  current_state_changed_at: string;
  sponsor_iqama: string | null;
  sponsor_name: string | null;
  travel_dates: { arrival?: string; stay_days?: number } | null;
  estimated_total_usd: number | null;
  deposit_paid_at: string | null;
  balance_invoiced_at: string | null;
  partner_reference: string | null;
  partner_submitted_at: string | null;
  issued_at: string | null;
  visa_pdf_path: string | null;
  refund_reason: string | null;
}

export type DocKind =
  | 'passport_bio'
  | 'passport_photo'
  | 'sponsor_iqama'
  | 'salary_certificate'
  | 'marriage_certificate'
  | 'birth_certificate'
  | 'invitation_letter'
  | 'business_licence'
  | 'other';

export interface VisaCaseDocument {
  id: string;
  case_id: string;
  doc_kind: DocKind;
  storage_path: string;
  uploaded_at: string;
  review_status: 'pending' | 'accepted' | 'rejected';
  reviewer_note: string | null;
}

// Wizard outcome chip → suggested visa mapping (used by the wizard handler).
// Outcomes that map to v2/v3 visas point to those types but the UI shows a
// "coming soon" deflection for v1.
export const OUTCOME_TO_VISA: Record<string, VisaType> = {
  'visit-saudi':         'tourist',
  'go-for-umrah':        'umrah',
  'perform-hajj':        'hajj',
  'bring-my-family':     'family_visit',
  'work-in-ksa':         'work_iqama',
  'hire-a-helper':       'domestic_worker',
  'do-business':         'business',
  'live-permanently':    'premium_residency',
};
```

- [ ] **Step 2: Type-check the file**

```bash
cd /Users/samuel/GLOBALHIRE@ELAB
deno check supabase/functions/_shared/visa-types.ts
```

Expected: `Check file:///.../visa-types.ts` → no errors. If `deno` is not installed, install with `brew install deno`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/visa-types.ts
git commit -m "feat(shared): visa types + V1 catalog + outcome-to-visa map"
```

---

### Task 5: Deno test config

**Files:**
- Create: `supabase/functions/deno.json`

- [ ] **Step 1: Write the file**

```json
{
  "tasks": {
    "test": "deno test --allow-env --allow-net --allow-read"
  },
  "imports": {
    "@std/assert":   "jsr:@std/assert@^1.0.0",
    "@std/testing":  "jsr:@std/testing@^1.0.0"
  },
  "fmt": {
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

- [ ] **Step 2: Verify Deno picks up the config**

```bash
cd /Users/samuel/GLOBALHIRE@ELAB/supabase/functions
deno task --help
```

Expected: lists `test` task. If `deno: command not found`, install: `brew install deno`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/deno.json
git commit -m "chore(functions): deno workspace config + test task"
```

---

### Task 6: Eligibility rule definitions (with TDD)

**Files:**
- Create: `supabase/functions/_shared/visa-eligibility-rules.ts`
- Test: `supabase/functions/_shared/visa-eligibility-rules_test.ts`

The rule runner takes the wizard input (visa type, nationality, sponsor info, travel dates) and returns `{passed: boolean, missingDocs: DocKind[], reasons: string[]}`. Plan 2's `check-visa-eligibility` edge function is just an HTTP wrapper around this.

- [ ] **Step 1: Write the failing test file**

```typescript
// supabase/functions/_shared/visa-eligibility-rules_test.ts
import { assertEquals, assertObjectMatch } from '@std/assert';
import { runEligibility, type EligibilityInput } from './visa-eligibility-rules.ts';

Deno.test('tourist eVisa: NG nationality with valid travel dates passes', () => {
  const input: EligibilityInput = {
    visa_type: 'tourist',
    nationality: 'NG',
    travel_dates: { arrival: '2026-08-01', stay_days: 14 },
  };
  const result = runEligibility(input);
  assertEquals(result.passed, true);
  assertEquals(result.reasons, []);
});

Deno.test('tourist eVisa: missing nationality fails with reason', () => {
  const input: EligibilityInput = { visa_type: 'tourist', travel_dates: { arrival: '2026-08-01' } };
  const result = runEligibility(input);
  assertEquals(result.passed, false);
  assertObjectMatch(result, { reasons: ['Nationality required for tourist eVisa eligibility check.'] });
});

Deno.test('umrah: missing nationality fails', () => {
  const result = runEligibility({ visa_type: 'umrah' });
  assertEquals(result.passed, false);
});

Deno.test('family_visit: requires sponsor_iqama', () => {
  const result = runEligibility({ visa_type: 'family_visit', nationality: 'NG' });
  assertEquals(result.passed, false);
  assertEquals(result.reasons.includes('Sponsor Iqama number required for Family Visit visa.'), true);
});

Deno.test('family_visit: passes with sponsor_iqama', () => {
  const result = runEligibility({
    visa_type: 'family_visit',
    nationality: 'NG',
    sponsor_iqama: '2456789012',
  });
  assertEquals(result.passed, true);
});

Deno.test('family_residence: requires sponsor_iqama AND relationship', () => {
  const noSponsor = runEligibility({ visa_type: 'family_residence', nationality: 'NG' });
  assertEquals(noSponsor.passed, false);

  const noRelationship = runEligibility({
    visa_type: 'family_residence',
    nationality: 'NG',
    sponsor_iqama: '2456789012',
  });
  assertEquals(noRelationship.passed, false);
  assertEquals(noRelationship.reasons.includes('Relationship to sponsor required for Family Residence.'), true);
});

Deno.test('family_residence: passes with full sponsor data', () => {
  const result = runEligibility({
    visa_type: 'family_residence',
    nationality: 'NG',
    sponsor_iqama: '2456789012',
    sponsor_relationship: 'spouse',
  });
  assertEquals(result.passed, true);
});

Deno.test('v2/v3 visa types return not_supported_yet', () => {
  const result = runEligibility({ visa_type: 'hajj', nationality: 'NG' });
  assertEquals(result.passed, false);
  assertEquals(result.reasons.includes('This visa type is not yet available — please contact us on WhatsApp.'), true);
});

Deno.test('all v1 types include passport_bio in missing docs', () => {
  for (const vt of ['tourist', 'umrah', 'family_visit', 'family_residence'] as const) {
    const result = runEligibility({ visa_type: vt, nationality: 'NG', sponsor_iqama: '2456789012', sponsor_relationship: 'spouse' });
    assertEquals(result.missingDocs.includes('passport_bio'), true, `missing for ${vt}`);
  }
});
```

- [ ] **Step 2: Run the test — expect all to fail (file doesn't exist)**

```bash
cd /Users/samuel/GLOBALHIRE@ELAB/supabase/functions
deno task test _shared/visa-eligibility-rules_test.ts
```

Expected: `Module not found "./visa-eligibility-rules.ts"`.

- [ ] **Step 3: Implement the rule runner**

```typescript
// supabase/functions/_shared/visa-eligibility-rules.ts
// Pure rule engine. Plan 2's check-visa-eligibility edge function wraps this.

import type { VisaType, DocKind } from './visa-types.ts';
import { V1_VISA_TYPES } from './visa-types.ts';

export interface EligibilityInput {
  visa_type: VisaType;
  nationality?: string;
  sponsor_iqama?: string;
  sponsor_relationship?: 'spouse' | 'child' | 'parent';
  travel_dates?: { arrival?: string; stay_days?: number };
}

export interface EligibilityResult {
  passed: boolean;
  missingDocs: DocKind[];
  reasons: string[];
}

const COMMON_DOCS_PER_VISA: Record<VisaType, DocKind[]> = {
  tourist:           ['passport_bio', 'passport_photo'],
  umrah:             ['passport_bio', 'passport_photo'],
  family_visit:      ['passport_bio', 'passport_photo', 'sponsor_iqama', 'salary_certificate'],
  family_residence:  ['passport_bio', 'passport_photo', 'sponsor_iqama', 'salary_certificate', 'marriage_certificate'],
  business:          ['passport_bio', 'invitation_letter', 'business_licence'],
  work_iqama:        ['passport_bio', 'salary_certificate'],
  domestic_worker:   ['passport_bio', 'sponsor_iqama', 'salary_certificate'],
  hajj:              ['passport_bio'],
  premium_residency: ['passport_bio'],
  investor_misa:     ['passport_bio', 'business_licence'],
  transit:           ['passport_bio'],
};

export function runEligibility(input: EligibilityInput): EligibilityResult {
  const reasons: string[] = [];
  const missingDocs = COMMON_DOCS_PER_VISA[input.visa_type] ?? [];

  // v1 cutoff
  if (!V1_VISA_TYPES.includes(input.visa_type)) {
    reasons.push('This visa type is not yet available — please contact us on WhatsApp.');
    return { passed: false, missingDocs, reasons };
  }

  // Per-visa rules
  switch (input.visa_type) {
    case 'tourist':
      if (!input.nationality) reasons.push('Nationality required for tourist eVisa eligibility check.');
      break;
    case 'umrah':
      if (!input.nationality) reasons.push('Nationality required for Umrah visa.');
      break;
    case 'family_visit':
      if (!input.nationality)   reasons.push('Nationality required for Family Visit visa.');
      if (!input.sponsor_iqama) reasons.push('Sponsor Iqama number required for Family Visit visa.');
      break;
    case 'family_residence':
      if (!input.nationality)          reasons.push('Nationality required for Family Residence.');
      if (!input.sponsor_iqama)        reasons.push('Sponsor Iqama number required for Family Residence.');
      if (!input.sponsor_relationship) reasons.push('Relationship to sponsor required for Family Residence.');
      break;
  }

  return { passed: reasons.length === 0, missingDocs, reasons };
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd /Users/samuel/GLOBALHIRE@ELAB/supabase/functions
deno task test _shared/visa-eligibility-rules_test.ts
```

Expected: `9 passed | 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/visa-eligibility-rules.ts supabase/functions/_shared/visa-eligibility-rules_test.ts
git commit -m "feat(shared): visa eligibility rule engine + tests"
```

---

### Task 7: Public-schema wrapper views (`gh_visa_*`)

GlobalHire's frontend convention (per `js/supabase-client.js`) avoids `Accept-Profile: globalhire` headers by reading from `public.gh_*` views that proxy `globalhire.*` tables. Add the visa wrappers so the dashboard JS in Plan 3 / admin JS in Plan 4 can use the existing `ghFrom('visa_cases')` helper.

**Files:**
- Create: `schema-v15-wrapper-views.sql`

- [ ] **Step 1: Write the file**

```sql
-- ============================================
-- GLOBALHIRE@ELAB — Schema v15 wrapper views
-- Mirror globalhire.visa_* tables under public.gh_* so the existing
-- ghFrom() client helper works without Accept-Profile headers.
-- RLS still applies (views inherit policies from base tables).
-- ============================================

CREATE OR REPLACE VIEW public.gh_visa_leads             AS SELECT * FROM globalhire.visa_leads;
CREATE OR REPLACE VIEW public.gh_visa_cases             AS SELECT * FROM globalhire.visa_cases;
CREATE OR REPLACE VIEW public.gh_visa_case_documents    AS SELECT * FROM globalhire.visa_case_documents;
CREATE OR REPLACE VIEW public.gh_visa_case_events       AS SELECT * FROM globalhire.visa_case_events;
CREATE OR REPLACE VIEW public.gh_visa_invoices          AS SELECT * FROM globalhire.visa_invoices;
CREATE OR REPLACE VIEW public.gh_partner_submissions    AS SELECT * FROM globalhire.partner_submissions;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.gh_visa_leads,
  public.gh_visa_cases,
  public.gh_visa_case_documents,
  public.gh_visa_case_events,
  public.gh_visa_invoices,
  public.gh_partner_submissions
TO anon, authenticated;

-- VERIFICATION:
SELECT count(*) AS wrapper_views
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('gh_visa_leads','gh_visa_cases','gh_visa_case_documents','gh_visa_case_events','gh_visa_invoices','gh_partner_submissions');
-- Expected: 6
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

- [ ] **Step 3: Verify — expect `wrapper_views = 6`**

- [ ] **Step 4: Smoke as anonymous role**

```sql
-- as anon: insert should succeed via wrapper (RLS on base table allows anon insert into visa_leads)
INSERT INTO public.gh_visa_leads (outcome, suggested_visa) VALUES ('test-wrapper', 'tourist');
DELETE FROM public.gh_visa_leads WHERE outcome = 'test-wrapper';  -- as service_role
```

- [ ] **Step 5: Commit**

```bash
git add schema-v15-wrapper-views.sql
git commit -m "feat(schema): public.gh_visa_* wrapper views for ghFrom() compatibility"
```

---

### Task 8: Tooling docs

**Files:**
- Create: `docs/visa-services-tooling.md`

- [ ] **Step 1: Write the doc**

```markdown
# Visa Services — Tooling

## Schema migrations

GlobalHire schema changes ship as `schema-vN.sql` files at the repo root. Run them by hand in the Supabase SQL Editor in numerical order. Each file ends with a `-- VERIFICATION` query you should execute after applying.

Visa-services additions:

- `schema-v15.sql` — enums + tables + indexes + state-change trigger
- `schema-v15-rls.sql` — row-level security policies
- `schema-v15-storage.sql` — `visa-documents` storage bucket + policies
- `schema-v15-wrapper-views.sql` — `public.gh_visa_*` views so frontend `ghFrom()` helper works

Apply order: v15 → v15-rls → v15-storage → v15-wrapper-views.

## Edge function tests

Edge functions live in `supabase/functions/`. Unit tests use Deno's built-in test runner.

```bash
# Install Deno (one-time)
brew install deno

# Run all tests
cd supabase/functions
deno task test

# Run one file
deno task test _shared/visa-eligibility-rules_test.ts
```

Tests are colocated with the file they test (`foo.ts` + `foo_test.ts`).

## Local function serving

```bash
supabase functions serve --env-file ./supabase/.env.local
# Then curl http://127.0.0.1:54321/functions/v1/<fn-name>
```

## Deploy

Deploy a single function:

```bash
supabase functions deploy <fn-name> --project-ref <ref>
```

The visa edge functions added by plans 2–4: `submit-visa-eligibility`, `check-visa-eligibility`, `start-visa-case`, `payment-webhook`, `submit-to-partner`, `partner-status-sync`, `notify-visa-status`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/visa-services-tooling.md
git commit -m "docs: visa services migration + edge function tooling guide"
```

---

## Self-Review Checklist

- [ ] All 6 tables, 2 enums, 1 trigger, 8 RLS policies, 1 storage bucket + 4 storage policies created
- [ ] Verification queries pass after each migration step
- [ ] `deno task test` runs and passes
- [ ] No edge function index.ts files yet — they belong to Plans 2–4 (YAGNI)
- [ ] `_shared/visa-types.ts` and `_shared/visa-eligibility-rules.ts` are pure modules with no side effects, importable from any function

## What this plan does NOT do (deferred to Plans 2–4)

- No edge function HTTP handlers (skeletons defer to where they're used)
- No public visa pages / wizard
- No payment integration
- No admin UI
- No email/WhatsApp templates
