# Partner Marketplace — Chunk 1: Agency Tenancy + Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the multi-tenant foundation for the GlobalHire Partner Marketplace — an `agency` entity that users belong to, self-serve agency signup, a partnership profile, GlobalHire-admin verification, and team seats — with `mp_*` row-level isolation proven (agency A can never see agency B).

**Architecture:** All in the GlobalHire system (Supabase `evzhnsugmvtqgmvzwyix`, repo `GLOBALHIRE@ELAB`). New tables in schema `globalhire`, prefix `mp_`, exposed through `public.gh_mp_*` `security_invoker` views (the current repo pattern — see `gh_recruiter_submitted_candidates`). Every `mp_*` table carries `agency_id` and an RLS policy `agency_id IN (SELECT globalhire.my_agency_ids()) OR globalhire.is_admin()`. Partner UI is a new `partners-*.html` page group (vanilla-JS IIFEs on `window.ghSupabase` / a new `mpFrom()` helper); admin UI extends `recruiters.html`. Edge functions (Deno) handle signup, verification, and invites, modelled on the existing `recruiter-register`.

**Tech Stack:** Static HTML + vanilla JS, Supabase JS v2, Postgres RLS, Supabase Storage, Supabase Edge Functions (Deno), `nodemailer` over Gmail SMTP for email. Tests: `deno test` with colocated `*_test.ts` (repo pattern — `supabase/functions/_shared/visa-eligibility-rules_test.ts`); Playwright `tests/*.spec.js` for page smokes; a SQL isolation script as the chunk's acceptance gate.

**Spec:** `docs/superpowers/specs/2026-09-03-globalhire-partner-marketplace-design.md` (§2 decisions, §4 tenancy, §5.1 / §5.11 data model, §11 inventory, §12 chunk 1).

## Global Constraints

- **Schema/versioning:** new tables live in `globalhire`; each is exposed via `public.gh_mp_<name>` created `WITH (security_invoker = true)`; front-end reads through `mpFrom('<name>')` → `gh_mp_<name>`. Migration SQL files are named `schema-vNN-<name>.sql` at repo root; **the last existing file is `schema-v29-…`, so this chunk starts at `schema-v30`**. Apply each via the Supabase MCP `apply_migration(project_id='evzhnsugmvtqgmvzwyix', name='vNN_<name>', query=<sql>)` (use the `supabase` skill), then verify with `execute_sql` and `get_advisors(type='security')`.
- **Atomic migrations:** a table's `CREATE TABLE`, its `ENABLE ROW LEVEL SECURITY`, all its policies, its `public.gh_mp_*` view, and the grants ship in **one** migration. Never enable RLS without the covering policy in the same transaction (silent zero-rows otherwise).
- **Admin check:** `globalhire.is_admin()` (exists, `SECURITY DEFINER`, confirmed safe by the 2026-07-06 RLS map). Edge functions that take an admin action re-check it server-side against `gh_profiles.role` — copy the pattern in `supabase/functions/recruiter-register/index.ts` (`callerProfile?.role === "admin"`).
- **Tenancy predicate:** every `mp_*` policy uses `agency_id IN (SELECT globalhire.my_agency_ids())` for agency users and `OR globalhire.is_admin()` for staff. No other cross-agency read path may exist.
- **Storage:** bucket `gh-applicant-documents` (exists). Marketplace path: `marketplace/agency/{agency_id}/{purpose}/{filename}`. Add an agency-scoped storage RLS policy (Task 5).
- **Do not touch** `globalhire.profiles` column guards, the `gh_profiles`/`gh_campaign_matches` views, `recruiter_submitted_candidates`, `recruiter_clients`, `recruiter_assignments`, or any existing `gh_*` view — the marketplace is additive. The `gh_*` RLS remediation already shipped 2026-07-06 (spec §4.4); this chunk does not revisit it.
- **AI provider:** `ANTHROPIC_API_KEY` + Claude (repo standard — `analyze-document`, `draft-message`). All marketplace AI goes through `_shared/mp-ai.ts` (Task 6). Env kill-switch `MP_AI_ENABLED` (absent or `"false"` → AI disabled).
- **Deploy:** commit changed served files (`.html`, `js/`); `.vercelignore` excludes `docs/` and `supabase/`. Site auto-deploys on push to `main` + `vercel --prod` for immediacy. Clean URLs (`.html` 308-redirects to `/slug`). Edge functions deploy separately via `supabase functions deploy <name>`.
- **Nomenclature:** the entity is an **agency** everywhere in new code (tables `mp_agencies`/`mp_agency_members`, JS `MP.currentAgency`). The legacy word "recruiter" stays only where it already exists.

---

## File structure

**Migrations (repo root):**
- `schema-v30-mp-agencies.sql` — `mp_agencies` + `mp_agency_members` + views + RLS + `globalhire.my_agency_ids()`
- `schema-v31-mp-agency-invites.sql` — `mp_agency_invites` + view + RLS
- `schema-v32-mp-ai-runs.sql` — `mp_ai_runs` + view + RLS
- `schema-v33-recruiter-to-agency-backfill.sql` — one-off data migration
- `schema-v34-mp-storage-policy.sql` — storage RLS for the marketplace path

**Edge functions (`supabase/functions/`):**
- `_shared/mp-ai.ts` + `_shared/mp-ai_test.ts` — the single AI wrapper
- `mp-agency-register/index.ts` — self-serve agency signup
- `mp-agency-verify/index.ts` — admin verify / reject / suspend
- `mp-agency-invite/index.ts` — owner/admin invites a teammate
- `mp-agency-invite-accept/index.ts` — invitee joins the agency

**Front-end:**
- `js/mp-core.js` — partner-portal bootstrap: resolve user → agency + membership + status; `mpFrom()`; guards
- `partners-signup.html` + `js/mp-signup.js`
- `partners-onboarding.html` + `js/mp-onboarding.js` — partnership profile + team
- `partners-dashboard.html` + `js/mp-dashboard.js` — post-login landing (minimal)
- `recruiters.html` (modify) + `js/mp-agencies-admin.js` — admin Agencies tab

**Tests:**
- `supabase/functions/_shared/mp-ai_test.ts`
- `supabase/functions/mp-agency-register/index_test.ts`, `mp-agency-verify/index_test.ts`, `mp-agency-invite/index_test.ts`
- `tests/rls/mp-isolation.sql` — the chunk acceptance gate
- `tests/partners.spec.js` — Playwright page smokes

---

### Task 1: DB — `mp_agencies` + `mp_agency_members` + views + RLS + `my_agency_ids()`

**Files:**
- Create: `schema-v30-mp-agencies.sql`

**Interfaces:**
- Produces:
  - `globalhire.mp_agencies` (base) / `public.gh_mp_agencies` (view). Columns: `id uuid pk default gen_random_uuid()`, `name text not null`, `country text`, `city text`, `address text`, `website text`, `year_founded int`, `owner_name text`, `services text[] not null default '{}'`, `cooperation_areas text[] not null default '{}'`, `licence_file_path text`, `company_profile_path text`, `status text not null default 'pending_verification' check (status in ('pending_verification','verified','suspended','rejected'))`, `verification_note text`, `verified_by uuid`, `verified_at timestamptz`, `created_by uuid not null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
  - `globalhire.mp_agency_members` (base) / `public.gh_mp_agency_members` (view). Columns: `id uuid pk default gen_random_uuid()`, `agency_id uuid not null references globalhire.mp_agencies(id) on delete cascade`, `user_id uuid not null`, `role text not null default 'member' check (role in ('owner','admin','member'))`, `status text not null default 'active' check (status in ('active','invited','removed'))`, `invited_by uuid`, `created_at timestamptz not null default now()`. `unique (agency_id, user_id)`.
  - `globalhire.my_agency_ids() returns setof uuid` — `SECURITY DEFINER`, `STABLE`, `SET search_path = ''`; body: `SELECT agency_id FROM globalhire.mp_agency_members WHERE user_id = auth.uid() AND status = 'active'`.
- Consumed by: every later `mp_*` migration; `js/mp-core.js`.

- [ ] **Step 1: Confirm the version and no name clash.** With the `supabase` skill / MCP `execute_sql` against `evzhnsugmvtqgmvzwyix`: `select table_name from information_schema.tables where table_schema='globalhire' and table_name like 'mp_%';` → expect 0 rows. Confirm `select proname from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='globalhire' and proname='is_admin';` returns 1 row.

- [ ] **Step 2: Write `schema-v30-mp-agencies.sql`.**

```sql
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
```

- [ ] **Step 3: Apply the migration.** Supabase MCP `apply_migration(project_id='evzhnsugmvtqgmvzwyix', name='v30_mp_agencies', query=<file contents>)`.

- [ ] **Step 4: Verify structure.** `execute_sql`:
  - `select count(*) from globalhire.mp_agencies;` → 0, no error.
  - `select * from public.gh_mp_agencies limit 1;` → no error.
  - `select relrowsecurity from pg_class where oid = 'globalhire.mp_agencies'::regclass;` → `t`.
  - `select (reloptions::text) from pg_class where oid='public.gh_mp_agencies'::regclass;` → contains `security_invoker=true`.
  - `get_advisors(type='security')` → no new `security_definer_view` or `rls_disabled_in_public` entries for `gh_mp_*` / `mp_*`.

- [ ] **Step 5: Verify isolation with rolled-back synthetic sessions.** `execute_sql` (each in its own `BEGIN … ROLLBACK`):
  - Insert two agencies A and B and a member row putting synthetic uid `11111111-1111-1111-1111-111111111111` as active member of A only.
  - `SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';`
  - `select id from globalhire.mp_agencies;` → returns **only** A's id.
  - `update globalhire.mp_agencies set status='verified' where id = <B.id>;` → 0 rows affected (policy) — and if it targeted A, the column guard raises. Confirm both.
  - `ROLLBACK;`

- [ ] **Step 6: Commit.**

```bash
git add schema-v30-mp-agencies.sql
git commit -m "feat(db): mp_agencies + mp_agency_members + gh_mp_* views + RLS + my_agency_ids()"
```

---

### Task 2: DB — `mp_agency_invites` + view + RLS

**Files:**
- Create: `schema-v31-mp-agency-invites.sql`

**Interfaces:**
- Produces: `globalhire.mp_agency_invites` / `public.gh_mp_agency_invites`. Columns: `id uuid pk default gen_random_uuid()`, `agency_id uuid not null references globalhire.mp_agencies(id) on delete cascade`, `email text not null`, `role text not null default 'member' check (role in ('admin','member'))`, `token text not null unique`, `invited_by uuid not null`, `status text not null default 'pending' check (status in ('pending','accepted','revoked','expired'))`, `expires_at timestamptz not null`, `accepted_at timestamptz`, `accepted_user_id uuid`, `created_at timestamptz not null default now()`.
- Consumed by: `mp-agency-invite` / `mp-agency-invite-accept` (Task 9), `js/mp-onboarding.js` (Task 12).

- [ ] **Step 1: Write `schema-v31-mp-agency-invites.sql`.**

```sql
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
CREATE POLICY mp_invites_agency_or_invitee_select ON globalhire.mp_agency_invites
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT globalhire.my_agency_ids())
    OR lower(email) = lower((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()))
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
```

- [ ] **Step 2: Apply** via `apply_migration(name='v31_mp_agency_invites', …)`.

- [ ] **Step 3: Verify.** `execute_sql`: table exists, RLS on, `select token from public.gh_mp_agency_invites` → **error / column does not exist** (confirms token is not exposed). `get_advisors(type='security')` clean.

- [ ] **Step 4: Commit.**

```bash
git add schema-v31-mp-agency-invites.sql
git commit -m "feat(db): mp_agency_invites + gh_mp_agency_invites (token withheld) + RLS"
```

---

### Task 3: DB — `mp_ai_runs` telemetry table

**Files:**
- Create: `schema-v32-mp-ai-runs.sql`

**Interfaces:**
- Produces: `globalhire.mp_ai_runs` / `public.gh_mp_ai_runs` (admin-read only). Columns: `id uuid pk default gen_random_uuid()`, `feature text not null check (feature in ('parse','match','screen','draft','dedupe_tiebreak'))`, `context_id text`, `agency_id uuid`, `model text`, `prompt_tokens int`, `completion_tokens int`, `cost_usd numeric(10,5)`, `latency_ms int`, `status text not null check (status in ('ok','error'))`, `error text`, `created_at timestamptz not null default now()`.
- Consumed by: `_shared/mp-ai.ts` (Task 6) writes rows via service role; a future `admin-mp-ai.html` reads.

- [ ] **Step 1: Write `schema-v32-mp-ai-runs.sql`.**

```sql
-- schema-v32-mp-ai-runs.sql
BEGIN;

CREATE TABLE globalhire.mp_ai_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature            text NOT NULL CHECK (feature IN ('parse','match','screen','draft','dedupe_tiebreak')),
  context_id         text,
  agency_id          uuid,
  model              text,
  prompt_tokens      int,
  completion_tokens  int,
  cost_usd           numeric(10,5),
  latency_ms         int,
  status             text NOT NULL CHECK (status IN ('ok','error')),
  error              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mp_ai_runs_feature_created_idx ON globalhire.mp_ai_runs (feature, created_at DESC);

ALTER TABLE globalhire.mp_ai_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY mp_ai_runs_admin_only ON globalhire.mp_ai_runs
  FOR SELECT TO authenticated USING (globalhire.is_admin());
-- Inserts are service-role only (mp-ai.ts) → no authenticated INSERT policy.

CREATE VIEW public.gh_mp_ai_runs WITH (security_invoker = true) AS
  SELECT * FROM globalhire.mp_ai_runs;
GRANT SELECT ON globalhire.mp_ai_runs TO authenticated;
GRANT SELECT ON public.gh_mp_ai_runs TO authenticated;

COMMIT;
```

- [ ] **Step 2: Apply** `apply_migration(name='v32_mp_ai_runs', …)`, verify table + RLS + advisors clean.

- [ ] **Step 3: Commit.**

```bash
git add schema-v32-mp-ai-runs.sql
git commit -m "feat(db): mp_ai_runs AI telemetry table (admin-read, service-role write)"
```

---

### Task 4: DB — recruiter → agency backfill

**Files:**
- Create: `schema-v33-recruiter-to-agency-backfill.sql`

**Interfaces:**
- Consumes: `globalhire.profiles` (existing — has `role`, `recruiter_approved`, `organization_name`, `country_of_origin`, `full_name`), `mp_agencies`, `mp_agency_members` (Task 1).
- Produces: one `mp_agencies` row (`status='verified'`) + one `owner` `mp_agency_members` row per existing approved recruiter. Idempotent.

- [ ] **Step 1: Inspect the source.** `execute_sql`: `select id, full_name, organization_name, country_of_origin, recruiter_approved from globalhire.profiles where role='recruiter';` — note how many rows, and how many have `organization_name` (fallback to `full_name || ' (agency)'` when null).

- [ ] **Step 2: Write `schema-v33-recruiter-to-agency-backfill.sql`.**

```sql
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
```

- [ ] **Step 3: Apply** `apply_migration(name='v33_recruiter_to_agency_backfill', …)`.

- [ ] **Step 4: Verify counts.** `execute_sql`:
  - `select count(*) from globalhire.profiles where role='recruiter' and recruiter_approved;` = N.
  - `select count(*) from globalhire.mp_agency_members where role='owner';` = N.
  - `select count(*) from globalhire.mp_agencies where status='verified';` ≥ N.
  - Re-run the migration → 0 new rows (idempotency).

- [ ] **Step 5: Commit.**

```bash
git add schema-v33-recruiter-to-agency-backfill.sql
git commit -m "feat(db): backfill mp_agencies + owner memberships from approved recruiters"
```

---

### Task 5: DB — storage RLS for the marketplace path

**Files:**
- Create: `schema-v34-mp-storage-policy.sql`

**Interfaces:**
- Produces: `storage.objects` policies letting an active agency member read/write only under
  `gh-applicant-documents/marketplace/agency/{their agency_id}/…`.
- Consumed by: `js/mp-onboarding.js` (licence + company-profile uploads), later chunks (candidate docs).

- [ ] **Step 1: Check existing storage policies for a pattern.** `execute_sql`: `select policyname, cmd, qual from pg_policies where schemaname='storage' and tablename='objects';` — note the existing `recruiter-clients/{uid}/…` policy from `schema-v18-recruiter-storage-policies.sql` and mirror its shape.

- [ ] **Step 2: Write `schema-v34-mp-storage-policy.sql`.**

```sql
-- schema-v34-mp-storage-policy.sql
-- Agency members can read/write objects only under
--   gh-applicant-documents/marketplace/agency/<agency_id>/...
BEGIN;

CREATE POLICY "mp agency members read own agency objects"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'gh-applicant-documents'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = 'agency'
  AND ((storage.foldername(name))[3])::uuid IN (SELECT globalhire.my_agency_ids())
);

CREATE POLICY "mp agency members write own agency objects"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'gh-applicant-documents'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = 'agency'
  AND ((storage.foldername(name))[3])::uuid IN (SELECT globalhire.my_agency_ids())
);

CREATE POLICY "mp agency members update own agency objects"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'gh-applicant-documents'
  AND (storage.foldername(name))[1] = 'marketplace'
  AND (storage.foldername(name))[2] = 'agency'
  AND ((storage.foldername(name))[3])::uuid IN (SELECT globalhire.my_agency_ids())
);

COMMIT;
```

- [ ] **Step 3: Apply** `apply_migration(name='v34_mp_storage_policy', …)`.

- [ ] **Step 4: Verify with a rolled-back synthetic session.** `execute_sql` in `BEGIN … ROLLBACK`: set `request.jwt.claims` to the synthetic member of agency A from Task 1; `insert into storage.objects (bucket_id, name, owner) values ('gh-applicant-documents', 'marketplace/agency/<A.id>/licence/x.pdf', auth.uid());` → succeeds; same with `<B.id>` in the path → RLS violation. `ROLLBACK`.

- [ ] **Step 5: Commit.**

```bash
git add schema-v34-mp-storage-policy.sql
git commit -m "feat(db): storage RLS scoping marketplace/agency/<id> to agency members"
```

---

### Task 6: `_shared/mp-ai.ts` — the single AI wrapper

**Files:**
- Create: `supabase/functions/_shared/mp-ai.ts`
- Test: `supabase/functions/_shared/mp-ai_test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MpAiFeature = 'parse' | 'match' | 'screen' | 'draft' | 'dedupe_tiebreak';
  export interface MpAiOpts {
    feature: MpAiFeature;
    system: string;
    user: string;
    jsonSchema?: Record<string, unknown>;   // when set, response must parse to this shape
    model?: string;                          // default per feature
    maxTokens?: number;                      // default 1500
    contextId?: string;
    agencyId?: string;
  }
  export interface MpAiResult {
    ok: boolean;
    data: unknown;        // parsed JSON when jsonSchema given, else raw text
    text: string;
    usage: { prompt: number; completion: number; costUsd: number };
    error?: string;
  }
  export function isAiEnabled(): boolean;
  export async function callAI(opts: MpAiOpts): Promise<MpAiResult>;
  export function estimateCostUsd(model: string, prompt: number, completion: number): number;
  ```
- Consumes: `Deno.env` (`ANTHROPIC_API_KEY`, `MP_AI_ENABLED`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), `globalhire.mp_ai_runs` (insert via service role).

- [ ] **Step 1: Write the failing test** `supabase/functions/_shared/mp-ai_test.ts`.

```ts
import { assertEquals, assert } from '@std/assert';
import { estimateCostUsd, isAiEnabled } from './mp-ai.ts';

Deno.test('isAiEnabled: false when MP_AI_ENABLED unset', () => {
  Deno.env.delete('MP_AI_ENABLED');
  assertEquals(isAiEnabled(), false);
});

Deno.test('isAiEnabled: true only for the literal "true"', () => {
  Deno.env.set('MP_AI_ENABLED', 'true');
  assertEquals(isAiEnabled(), true);
  Deno.env.set('MP_AI_ENABLED', 'TRUE');
  assertEquals(isAiEnabled(), false);
});

Deno.test('estimateCostUsd: sonnet pricing, positive and scales with tokens', () => {
  const a = estimateCostUsd('claude-sonnet-4-20250514', 1000, 500);
  const b = estimateCostUsd('claude-sonnet-4-20250514', 2000, 1000);
  assert(a > 0);
  assertEquals(Math.round(b / a), 2);
});
```

- [ ] **Step 2: Run it, verify it fails.** `cd supabase/functions && deno test _shared/mp-ai_test.ts` → FAIL (`mp-ai.ts` not found / exports missing).

- [ ] **Step 3: Implement `supabase/functions/_shared/mp-ai.ts`.**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type MpAiFeature = 'parse' | 'match' | 'screen' | 'draft' | 'dedupe_tiebreak';

export interface MpAiOpts {
  feature: MpAiFeature;
  system: string;
  user: string;
  jsonSchema?: Record<string, unknown>;
  model?: string;
  maxTokens?: number;
  contextId?: string;
  agencyId?: string;
}
export interface MpAiResult {
  ok: boolean;
  data: unknown;
  text: string;
  usage: { prompt: number; completion: number; costUsd: number };
  error?: string;
}

const DEFAULT_MODEL: Record<MpAiFeature, string> = {
  parse: 'claude-sonnet-4-20250514',
  match: 'claude-sonnet-4-20250514',
  screen: 'claude-sonnet-4-20250514',
  draft: 'claude-3-5-haiku-20241022',
  dedupe_tiebreak: 'claude-3-5-haiku-20241022',
};

// USD per 1M tokens (input, output). Update if Anthropic pricing changes.
const PRICING: Record<string, [number, number]> = {
  'claude-sonnet-4-20250514': [3, 15],
  'claude-3-5-haiku-20241022': [0.8, 4],
  'claude-3-haiku-20240307': [0.25, 1.25],
};

export function isAiEnabled(): boolean {
  return Deno.env.get('MP_AI_ENABLED') === 'true';
}

export function estimateCostUsd(model: string, prompt: number, completion: number): number {
  const [inP, outP] = PRICING[model] ?? PRICING['claude-sonnet-4-20250514'];
  return +(((prompt * inP) + (completion * outP)) / 1_000_000).toFixed(5);
}

function svc() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function logRun(row: Record<string, unknown>) {
  try {
    await svc().schema('globalhire').from('mp_ai_runs').insert(row);
  } catch (e) {
    console.warn('mp_ai_runs insert failed (non-fatal):', (e as Error).message);
  }
}

export async function callAI(opts: MpAiOpts): Promise<MpAiResult> {
  const model = opts.model ?? DEFAULT_MODEL[opts.feature];
  const maxTokens = opts.maxTokens ?? 1500;
  const started = Date.now();
  const empty = { prompt: 0, completion: 0, costUsd: 0 };

  if (!isAiEnabled()) {
    return { ok: false, data: null, text: '', usage: empty, error: 'ai_disabled' };
  }
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return { ok: false, data: null, text: '', usage: empty, error: 'no_api_key' };

  const sys = opts.jsonSchema
    ? `${opts.system}\n\nReturn ONLY a JSON object matching this schema, no prose:\n${JSON.stringify(opts.jsonSchema)}`
    : opts.system;

  const doCall = async () => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: sys,
        messages: [{ role: 'user', content: opts.user }],
      }),
    });
    return r;
  };

  try {
    let resp = await doCall();
    if (!resp.ok) {
      const body = await resp.text();
      await logRun({
        feature: opts.feature, context_id: opts.contextId ?? null, agency_id: opts.agencyId ?? null,
        model, status: 'error', error: `http_${resp.status}: ${body.slice(0, 400)}`,
        latency_ms: Date.now() - started,
      });
      return { ok: false, data: null, text: '', usage: empty, error: `http_${resp.status}` };
    }
    const j = await resp.json();
    const text: string = (j.content ?? []).map((b: { text?: string }) => b.text ?? '').join('');
    const prompt = j.usage?.input_tokens ?? 0;
    const completion = j.usage?.output_tokens ?? 0;
    const costUsd = estimateCostUsd(model, prompt, completion);

    let data: unknown = text;
    let parseErr: string | undefined;
    if (opts.jsonSchema) {
      try {
        data = JSON.parse(text.trim().replace(/^```json\s*|\s*```$/g, ''));
      } catch {
        // one retry with an explicit "JSON only" nudge
        const retry = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model, max_tokens: maxTokens, system: sys,
            messages: [
              { role: 'user', content: opts.user },
              { role: 'assistant', content: text },
              { role: 'user', content: 'That was not valid JSON. Reply with ONLY the JSON object.' },
            ],
          }),
        });
        if (retry.ok) {
          const rj = await retry.json();
          const rt: string = (rj.content ?? []).map((b: { text?: string }) => b.text ?? '').join('');
          try { data = JSON.parse(rt.trim().replace(/^```json\s*|\s*```$/g, '')); }
          catch { parseErr = 'json_parse_failed'; }
        } else {
          parseErr = 'json_parse_failed';
        }
      }
    }

    await logRun({
      feature: opts.feature, context_id: opts.contextId ?? null, agency_id: opts.agencyId ?? null,
      model, prompt_tokens: prompt, completion_tokens: completion, cost_usd: costUsd,
      latency_ms: Date.now() - started, status: parseErr ? 'error' : 'ok', error: parseErr ?? null,
    });

    if (parseErr) return { ok: false, data: null, text, usage: { prompt, completion, costUsd }, error: parseErr };
    return { ok: true, data, text, usage: { prompt, completion, costUsd } };
  } catch (e) {
    await logRun({
      feature: opts.feature, context_id: opts.contextId ?? null, agency_id: opts.agencyId ?? null,
      model, status: 'error', error: (e as Error).message, latency_ms: Date.now() - started,
    });
    return { ok: false, data: null, text: '', usage: empty, error: (e as Error).message };
  }
}
```

- [ ] **Step 4: Run tests, verify pass.** `cd supabase/functions && deno test _shared/mp-ai_test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add supabase/functions/_shared/mp-ai.ts supabase/functions/_shared/mp-ai_test.ts
git commit -m "feat(fn): _shared/mp-ai.ts — single AI wrapper (routing, JSON enforce, cost log, kill-switch)"
```

---

### Task 7: Edge function — `mp-agency-register` (self-serve signup)

**Files:**
- Create: `supabase/functions/mp-agency-register/index.ts`
- Test: `supabase/functions/mp-agency-register/index_test.ts`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `GMAIL_USER`/`GMAIL_APP_PASSWORD`, `SITE_URL`. `globalhire.mp_agencies`, `globalhire.mp_agency_members`, `auth.admin.createUser`.
- Produces: `POST` (no auth) `{ full_name, email, password, agency_name, country, city?, phone? }` → `200 { success:true, user_id, agency_id, message }` | `400 { error }`. Side effects: creates auth user (metadata `role:'agency'`, `email_confirm:false`), one `mp_agencies` row (`status='pending_verification'`, `created_by=user_id`), one `mp_agency_members` (`role='owner'`, `status='active'`), sends a "registration received" email.

- [ ] **Step 1: Write the failing test** `index_test.ts` (pure input validation — the handler is factored so validation is testable without network).

```ts
import { assertEquals } from '@std/assert';
import { validateRegisterBody } from './index.ts';

Deno.test('validateRegisterBody: rejects missing required fields', () => {
  assertEquals(validateRegisterBody({}).ok, false);
  assertEquals(validateRegisterBody({ full_name: 'A', email: 'a@b.com' }).ok, false); // no password/agency
});

Deno.test('validateRegisterBody: accepts a complete body and normalises email', () => {
  const r = validateRegisterBody({
    full_name: ' Jane ', email: '  JANE@AGENCY.COM ', password: 'xxxxxxxx', agency_name: 'Jane Agency',
  });
  assertEquals(r.ok, true);
  assertEquals(r.value?.email, 'jane@agency.com');
  assertEquals(r.value?.full_name, 'Jane');
});

Deno.test('validateRegisterBody: rejects short password', () => {
  assertEquals(validateRegisterBody({
    full_name: 'J', email: 'j@a.com', password: 'short', agency_name: 'X',
  }).ok, false);
});
```

- [ ] **Step 2: Run it, verify it fails.** `deno test supabase/functions/mp-agency-register/index_test.ts` → FAIL.

- [ ] **Step 3: Implement `index.ts`** (model on `recruiter-register/index.ts`; export `validateRegisterBody` for the test).

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.10';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

export interface RegisterBody {
  full_name: string; email: string; password: string;
  agency_name: string; country?: string; city?: string; phone?: string;
}
export function validateRegisterBody(raw: Record<string, unknown>):
  { ok: true; value: RegisterBody } | { ok: false; error: string } {
  const full_name = String(raw.full_name ?? '').trim();
  const email = String(raw.email ?? '').trim().toLowerCase();
  const password = String(raw.password ?? '');
  const agency_name = String(raw.agency_name ?? '').trim();
  if (!full_name || !email || !password || !agency_name)
    return { ok: false, error: 'full_name, email, password and agency_name are required' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'invalid email' };
  if (password.length < 8) return { ok: false, error: 'password must be at least 8 characters' };
  return { ok: true, value: {
    full_name, email, password, agency_name,
    country: raw.country ? String(raw.country).trim() : undefined,
    city: raw.city ? String(raw.city).trim() : undefined,
    phone: raw.phone ? String(raw.phone).trim() : undefined,
  } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const parsed = validateRegisterBody(await req.json());
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const b = parsed.value;

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: created, error: cErr } = await sb.auth.admin.createUser({
      email: b.email, password: b.password, email_confirm: false,
      user_metadata: { full_name: b.full_name, role: 'agency' },
    });
    if (cErr) return json({ error: cErr.message }, 400);
    const userId = created.user.id;

    const { data: agency, error: aErr } = await sb.schema('globalhire').from('mp_agencies').insert({
      name: b.agency_name, country: b.country ?? null, city: b.city ?? null,
      owner_name: b.full_name, status: 'pending_verification', created_by: userId,
    }).select('id').single();
    if (aErr) { await sb.auth.admin.deleteUser(userId); return json({ error: aErr.message }, 400); }

    const { error: mErr } = await sb.schema('globalhire').from('mp_agency_members').insert({
      agency_id: agency.id, user_id: userId, role: 'owner', status: 'active',
    });
    if (mErr) return json({ error: mErr.message }, 400);

    // welcome / pending-review email (non-fatal)
    const smtpUser = Deno.env.get('GMAIL_USER') || 'support@elabsolution.org';
    const smtpPass = Deno.env.get('GMAIL_APP_PASSWORD');
    const site = Deno.env.get('SITE_URL') || 'https://globalhire.elabsolution.org';
    if (smtpPass) {
      try {
        const t = nodemailer.createTransport({
          host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass },
        });
        await t.sendMail({
          from: `"GlobalHire Partners" <${smtpUser}>`,
          to: b.email,
          subject: 'GlobalHire Partner registration received',
          text: `Hi ${b.full_name},\n\nWe've received your partner-agency registration for "${b.agency_name}". `
            + `Our team will review and verify your agency shortly — you'll get an email when you're approved.\n\n`
            + `Sign in: ${site}/login.html\n\n— GlobalHire Partners`,
        });
        t.close();
      } catch (e) { console.warn('register email failed (non-fatal):', (e as Error).message); }
    }

    return json({ success: true, user_id: userId, agency_id: agency.id,
      message: 'Registration received. An admin will verify your agency.' });
  } catch (e) {
    console.error('mp-agency-register error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
```

- [ ] **Step 4: Run tests, verify pass.** `deno test supabase/functions/mp-agency-register/index_test.ts` → PASS.

- [ ] **Step 5: Deploy + smoke.** `supabase functions deploy mp-agency-register --project-ref evzhnsugmvtqgmvzwyix`. Then `curl -sX POST "$SUPABASE_URL/functions/v1/mp-agency-register" -H "apikey: $ANON" -H 'content-type: application/json' -d '{"full_name":"Smoke Test","email":"smoke+mp1@example.com","password":"testpass123","agency_name":"Smoke Agency"}'` → `{success:true,...}`. `execute_sql`: confirm the `mp_agencies` (pending_verification) + owner `mp_agency_members` rows exist. Delete the smoke user + agency afterward (`auth.admin.deleteUser`, cascade drops the agency).

- [ ] **Step 6: Commit.**

```bash
git add supabase/functions/mp-agency-register/
git commit -m "feat(fn): mp-agency-register — self-serve agency signup (user + agency + owner + email)"
```

---

### Task 8: Edge function — `mp-agency-verify` (admin)

**Files:**
- Create: `supabase/functions/mp-agency-verify/index.ts`
- Test: `supabase/functions/mp-agency-verify/index_test.ts`

**Interfaces:**
- Consumes: admin JWT in `Authorization`; `globalhire.mp_agencies`; `auth.users` (agency owner email); SMTP env.
- Produces: `POST` `{ agency_id, action: 'verify'|'reject'|'suspend', note? }` → `200 { success:true, status }` | `401` (no/again-checked admin) | `400`. Side effect: sets `status`, `verification_note`, `verified_by`, `verified_at`; emails the agency owner. On `verify` also `email_confirm`s the owner's auth user so they can log in.

- [ ] **Step 1: Write failing test** — `validateVerifyBody` (exported).

```ts
import { assertEquals } from '@std/assert';
import { validateVerifyBody } from './index.ts';

Deno.test('validateVerifyBody: needs agency_id + known action', () => {
  assertEquals(validateVerifyBody({}).ok, false);
  assertEquals(validateVerifyBody({ agency_id: 'x', action: 'bogus' }).ok, false);
  assertEquals(validateVerifyBody({ agency_id: 'x', action: 'verify' }).ok, true);
});

Deno.test('validateVerifyBody: maps action to target status', () => {
  assertEquals(validateVerifyBody({ agency_id: 'x', action: 'verify' }).value?.status, 'verified');
  assertEquals(validateVerifyBody({ agency_id: 'x', action: 'reject' }).value?.status, 'rejected');
  assertEquals(validateVerifyBody({ agency_id: 'x', action: 'suspend' }).value?.status, 'suspended');
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement `index.ts`.**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.10';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const STATUS_FOR = { verify: 'verified', reject: 'rejected', suspend: 'suspended' } as const;
export function validateVerifyBody(raw: Record<string, unknown>):
  | { ok: true; value: { agency_id: string; action: keyof typeof STATUS_FOR; status: string; note?: string } }
  | { ok: false; error: string } {
  const agency_id = String(raw.agency_id ?? '').trim();
  const action = String(raw.action ?? '') as keyof typeof STATUS_FOR;
  if (!agency_id) return { ok: false, error: 'agency_id required' };
  if (!(action in STATUS_FOR)) return { ok: false, error: 'action must be verify|reject|suspend' };
  return { ok: true, value: { agency_id, action, status: STATUS_FOR[action],
    note: raw.note ? String(raw.note) : undefined } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);
    const { data: caller } = await svc.from('gh_profiles').select('role').eq('id', user.id).single();
    if (caller?.role !== 'admin') return json({ error: 'admin only' }, 401);

    const parsed = validateVerifyBody(await req.json());
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const { agency_id, status, note } = parsed.value;

    const { data: agency, error: uErr } = await svc.schema('globalhire').from('mp_agencies')
      .update({ status, verification_note: note ?? null, verified_by: user.id, verified_at: new Date().toISOString() })
      .eq('id', agency_id).select('id, name, status, created_by').single();
    if (uErr) return json({ error: uErr.message }, 400);

    if (status === 'verified') {
      await svc.auth.admin.updateUserById(agency.created_by, { email_confirm: true });
    }

    // notify the owner
    const { data: owner } = await svc.auth.admin.getUserById(agency.created_by);
    const to = owner?.user?.email;
    const smtpUser = Deno.env.get('GMAIL_USER') || 'support@elabsolution.org';
    const smtpPass = Deno.env.get('GMAIL_APP_PASSWORD');
    const site = Deno.env.get('SITE_URL') || 'https://globalhire.elabsolution.org';
    if (to && smtpPass) {
      try {
        const t = nodemailer.createTransport({
          host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } });
        const msg = status === 'verified'
          ? `Your agency "${agency.name}" is verified. Sign in and start nominating candidates: ${site}/partners-dashboard.html`
          : status === 'rejected'
          ? `Your agency application for "${agency.name}" was not approved.${note ? ' Reason: ' + note : ''}`
          : `Your agency "${agency.name}" has been suspended.${note ? ' Reason: ' + note : ''}`;
        await t.sendMail({ from: `"GlobalHire Partners" <${smtpUser}>`, to,
          subject: `GlobalHire Partner status: ${status}`, text: msg });
        t.close();
      } catch (e) { console.warn('verify email failed (non-fatal):', (e as Error).message); }
    }

    return json({ success: true, status });
  } catch (e) {
    console.error('mp-agency-verify error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
```

- [ ] **Step 4: Run tests, verify pass.**

- [ ] **Step 5: Deploy + authz smoke.** `supabase functions deploy mp-agency-verify --project-ref evzhnsugmvtqgmvzwyix`. `curl` with **no** Authorization → 401; with a non-admin JWT → 401; with an admin JWT + a pending test agency id → `{success:true,status:"verified"}`, and `execute_sql` confirms `status`/`verified_by`/`verified_at` set.

- [ ] **Step 6: Commit.**

```bash
git add supabase/functions/mp-agency-verify/
git commit -m "feat(fn): mp-agency-verify — admin verify/reject/suspend + owner email + email_confirm on verify"
```

---

### Task 9: Edge functions — `mp-agency-invite` + `mp-agency-invite-accept`

**Files:**
- Create: `supabase/functions/mp-agency-invite/index.ts`
- Create: `supabase/functions/mp-agency-invite-accept/index.ts`
- Test: `supabase/functions/mp-agency-invite/index_test.ts`

**Interfaces:**
- `mp-agency-invite`: `POST` (agency owner/admin JWT) `{ email, role: 'admin'|'member' }` → `200 { success, invite_id }`. Resolves the caller's agency via `mp_agency_members` (role in owner/admin, status active); inserts `mp_agency_invites` (`token` = `crypto.randomUUID()`, `expires_at` = +14d); emails the invitee a link `${SITE_URL}/partners-onboarding.html?invite=<token>`.
- `mp-agency-invite-accept`: `POST` (signed-in JWT) `{ token }` → `200 { success, agency_id }`. Validates the invite (`status='pending'`, not expired); upserts `mp_agency_members` (`user_id`=caller, `role`=invite.role, `status='active'`); sets invite `status='accepted'`, `accepted_at`, `accepted_user_id`. Rejects if the caller already belongs to another agency (Phase 1: one agency per user).
- Produces (exported for tests): `validateInviteBody`, `inviteExpiry()`.

- [ ] **Step 1: Write failing test** `mp-agency-invite/index_test.ts`.

```ts
import { assertEquals, assert } from '@std/assert';
import { validateInviteBody, inviteExpiry } from './index.ts';

Deno.test('validateInviteBody: email + role in {admin,member}', () => {
  assertEquals(validateInviteBody({ email: 'a@b.com', role: 'member' }).ok, true);
  assertEquals(validateInviteBody({ email: 'a@b.com', role: 'owner' }).ok, false);
  assertEquals(validateInviteBody({ role: 'member' }).ok, false);
});

Deno.test('inviteExpiry: ~14 days out', () => {
  const days = (inviteExpiry().getTime() - Date.now()) / 86_400_000;
  assert(days > 13.5 && days < 14.5);
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement both functions.** `mp-agency-invite/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.10';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

export function validateInviteBody(raw: Record<string, unknown>) {
  const email = String(raw.email ?? '').trim().toLowerCase();
  const role = String(raw.role ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false as const, error: 'valid email required' };
  if (role !== 'admin' && role !== 'member') return { ok: false as const, error: 'role must be admin|member' };
  return { ok: true as const, value: { email, role } };
}
export function inviteExpiry(): Date { return new Date(Date.now() + 14 * 86_400_000); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const uc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const parsed = validateInviteBody(await req.json());
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const { data: mem } = await svc.schema('globalhire').from('mp_agency_members')
      .select('agency_id, role').eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (!mem || !['owner', 'admin'].includes(mem.role))
      return json({ error: 'only an agency owner or admin can invite' }, 403);

    const token = crypto.randomUUID();
    const { data: inv, error } = await svc.schema('globalhire').from('mp_agency_invites').insert({
      agency_id: mem.agency_id, email: parsed.value.email, role: parsed.value.role,
      token, invited_by: user.id, expires_at: inviteExpiry().toISOString(),
    }).select('id').single();
    if (error) return json({ error: error.message }, 400);

    const site = Deno.env.get('SITE_URL') || 'https://globalhire.elabsolution.org';
    const smtpUser = Deno.env.get('GMAIL_USER') || 'support@elabsolution.org';
    const smtpPass = Deno.env.get('GMAIL_APP_PASSWORD');
    if (smtpPass) {
      try {
        const t = nodemailer.createTransport({
          host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } });
        await t.sendMail({
          from: `"GlobalHire Partners" <${smtpUser}>`, to: parsed.value.email,
          subject: 'You have been invited to a GlobalHire Partner agency',
          text: `You've been invited to join an agency on GlobalHire Partners.\n\n`
            + `Accept: ${site}/partners-onboarding.html?invite=${token}\n\n`
            + `If you don't have an account yet, create one first, then open the link above.`,
        });
        t.close();
      } catch (e) { console.warn('invite email failed (non-fatal):', (e as Error).message); }
    }
    return json({ success: true, invite_id: inv.id });
  } catch (e) {
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
```

`mp-agency-invite-accept/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'sign in first' }, 401);
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const uc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return json({ error: 'sign in first' }, 401);

    const { token } = await req.json();
    if (!token) return json({ error: 'token required' }, 400);

    const { data: inv } = await svc.schema('globalhire').from('mp_agency_invites')
      .select('*').eq('token', token).maybeSingle();
    if (!inv || inv.status !== 'pending') return json({ error: 'invite not found or already used' }, 400);
    if (new Date(inv.expires_at) < new Date()) {
      await svc.schema('globalhire').from('mp_agency_invites').update({ status: 'expired' }).eq('id', inv.id);
      return json({ error: 'invite expired' }, 400);
    }

    const { data: existing } = await svc.schema('globalhire').from('mp_agency_members')
      .select('agency_id').eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (existing && existing.agency_id !== inv.agency_id)
      return json({ error: 'you already belong to another agency' }, 409);

    await svc.schema('globalhire').from('mp_agency_members').upsert({
      agency_id: inv.agency_id, user_id: user.id, role: inv.role, status: 'active', invited_by: inv.invited_by,
    }, { onConflict: 'agency_id,user_id' });
    await svc.schema('globalhire').from('mp_agency_invites').update({
      status: 'accepted', accepted_at: new Date().toISOString(), accepted_user_id: user.id,
    }).eq('id', inv.id);

    return json({ success: true, agency_id: inv.agency_id });
  } catch (e) {
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
```

- [ ] **Step 4: Run tests, verify pass.** `deno test supabase/functions/mp-agency-invite/index_test.ts` → PASS.

- [ ] **Step 5: Deploy + smoke.** Deploy both. Invite: owner JWT + `{email,role}` → invite row created, `token` present in base table (not in view). Accept: sign in as the invitee test user, POST `{token}` → member row `active`, invite `accepted`. Expired-token and cross-agency (409) branches checked with crafted rows.

- [ ] **Step 6: Commit.**

```bash
git add supabase/functions/mp-agency-invite/ supabase/functions/mp-agency-invite-accept/
git commit -m "feat(fn): mp-agency-invite + mp-agency-invite-accept — agency team seats (token, 14d expiry, one-agency-per-user)"
```

---

### Task 10: `js/mp-core.js` — partner-portal bootstrap

**Files:**
- Create: `js/mp-core.js`

**Interfaces:**
- Consumes: `window.ghSupabase`, `window.ghFrom` (from `js/supabase-client.js`, which every partner page loads first).
- Produces (global `window.MP`):
  ```js
  MP.mpFrom(table)            // → ghSupabase.from('gh_mp_' + table)
  await MP.init()             // resolves session → MP.user, MP.membership, MP.agency; returns MP
  MP.user                     // auth user | null
  MP.membership               // { agency_id, role, status } | null
  MP.agency                   // gh_mp_agencies row | null
  MP.status                   // 'no_agency' | 'pending_verification' | 'verified' | 'suspended' | 'rejected'
  MP.requireAgency(opts)      // redirect to login/signup if no membership
  MP.requireVerified(opts)    // redirect to partners-onboarding.html if not verified
  MP.callFn(name, body)       // fetch a marketplace edge fn with the session JWT
  MP.esc(str)                 // HTML-escape helper (copy from js/recruiter.js)
  ```

- [ ] **Step 1: Implement `js/mp-core.js`.**

```js
/* GLOBALHIRE@ELAB — Partner Marketplace core bootstrap. Loaded after js/supabase-client.js. */
(function () {
  var sb = window.ghSupabase;

  function mpFrom(table) { return sb.from('gh_mp_' + table); }

  function esc(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s == null ? '' : s)));
    return d.innerHTML;
  }

  var MP = {
    user: null, membership: null, agency: null, status: 'no_agency',
    mpFrom: mpFrom, esc: esc,

    async init() {
      var u = await sb.auth.getUser();
      MP.user = (u && u.data && u.data.user) || null;
      if (!MP.user) { MP.status = 'no_agency'; return MP; }

      var m = await mpFrom('agency_members')
        .select('agency_id, role, status')
        .eq('user_id', MP.user.id).eq('status', 'active').maybeSingle();
      MP.membership = (m && m.data) || null;
      if (!MP.membership) { MP.status = 'no_agency'; return MP; }

      var a = await mpFrom('agencies').select('*').eq('id', MP.membership.agency_id).maybeSingle();
      MP.agency = (a && a.data) || null;
      MP.status = MP.agency ? MP.agency.status : 'no_agency';
      return MP;
    },

    requireAgency(opts) {
      opts = opts || {};
      if (!MP.user) { window.location.href = 'login.html'; return false; }
      if (!MP.membership) { window.location.href = opts.to || 'partners-signup.html'; return false; }
      return true;
    },

    requireVerified(opts) {
      if (!MP.requireAgency(opts)) return false;
      if (MP.status !== 'verified') {
        window.location.href = (opts && opts.to) || 'partners-onboarding.html';
        return false;
      }
      return true;
    },

    async callFn(name, body) {
      var s = await sb.auth.getSession();
      var token = s && s.data && s.data.session ? s.data.session.access_token : null;
      var res = await fetch(sb.supabaseUrl + '/functions/v1/' + name, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': sb.supabaseKey,
          'Authorization': token ? ('Bearer ' + token) : ('Bearer ' + sb.supabaseKey)
        },
        body: JSON.stringify(body || {})
      });
      var json = await res.json().catch(function () { return {}; });
      return { ok: res.ok, status: res.status, data: json };
    }
  };

  window.MP = MP;
})();
```

- [ ] **Step 2: Sanity check names.** Confirm `js/supabase-client.js` exposes `ghSupabase` with `.supabaseUrl` / `.supabaseKey` (Supabase JS v2 client props). If those props differ in the loaded SDK version, read `SUPABASE_URL`/`SUPABASE_ANON_KEY` off the module-level vars instead (they're `var`, so on `window` only if not shadowed — safer to hardcode-read from a small `MP.config` you set from the same constants). Adjust `callFn` accordingly.

- [ ] **Step 3: Commit.**

```bash
git add js/mp-core.js
git commit -m "feat(js): mp-core.js — partner portal bootstrap (agency/membership resolve, guards, callFn)"
```

---

### Task 11: `partners-signup.html` + `js/mp-signup.js`

**Files:**
- Create: `partners-signup.html`
- Create: `js/mp-signup.js`

**Interfaces:**
- Consumes: `MP.callFn('mp-agency-register', …)`, `window.ghSupabase.auth.signInWithPassword`.
- Produces: on success, signs the new user in and redirects to `partners-onboarding.html`.

- [ ] **Step 1: Build `partners-signup.html`.** Copy the dark-theme shell + `<head>` (fonts, favicon, brand) and the script-load order from `recruiter-signup.html`. Load order at end of `<body>`: `js/supabase-client.js`, `js/mp-core.js`, `js/mp-signup.js`. Form `#mp-signup-form` fields: `full_name*`, `email*`, `password*` (min 8), `agency_name*`, `country`, `city`, `phone`. A `#mp-signup-msg` status line. A link to `login.html` for existing partners.

- [ ] **Step 2: Implement `js/mp-signup.js`.**

```js
(function () {
  var form = document.getElementById('mp-signup-form');
  var msg = document.getElementById('mp-signup-msg');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    msg.textContent = 'Creating your agency…';
    var f = new FormData(form);
    var body = {
      full_name: f.get('full_name'), email: f.get('email'), password: f.get('password'),
      agency_name: f.get('agency_name'), country: f.get('country') || undefined,
      city: f.get('city') || undefined, phone: f.get('phone') || undefined
    };
    var r = await window.MP.callFn('mp-agency-register', body);
    if (!r.ok) { msg.textContent = (r.data && r.data.error) || 'Registration failed.'; return; }
    var si = await window.ghSupabase.auth.signInWithPassword({ email: body.email, password: body.password });
    if (si.error) { window.location.href = 'login.html'; return; }
    window.location.href = 'partners-onboarding.html';
  });
})();
```

- [ ] **Step 3: Add a Playwright smoke** to `tests/partners.spec.js` (create the file): navigate to `/partners-signup`, assert `#mp-signup-form` and the four required inputs are present, no console errors.

- [ ] **Step 4: Verify.** `npx playwright test tests/partners.spec.js` → the signup smoke passes. Manual: submit the form with a throwaway email → lands on `partners-onboarding.html`; the agency row exists (`pending_verification`).

- [ ] **Step 5: Commit.**

```bash
git add partners-signup.html js/mp-signup.js tests/partners.spec.js
git commit -m "feat(partners): partners-signup page + mp-signup.js (agency self-registration)"
```

---

### Task 12: `partners-onboarding.html` + `js/mp-onboarding.js` — partnership profile + team

**Files:**
- Create: `partners-onboarding.html`
- Create: `js/mp-onboarding.js`

**Interfaces:**
- Consumes: `MP.init()`, `MP.mpFrom('agencies')` (update), `MP.mpFrom('agency_members')` (list), `MP.callFn('mp-agency-invite', …)`, `MP.callFn('mp-agency-invite-accept', {token})`, `window.ghSupabase.storage.from('gh-applicant-documents')`.
- Behaviour: if `?invite=<token>` present and the user is signed in → call `mp-agency-invite-accept` first, then reload. Renders: a verification-status banner; the partnership-profile form; a team panel (members list + invite-by-email, shown only to `owner`/`admin`). Editable at any status; the page is where unverified agencies live.

- [ ] **Step 1: Build `partners-onboarding.html`.** Dark-theme shell. Script load: `js/supabase-client.js`, `js/mp-core.js`, `js/mp-onboarding.js`. Sections:
  - `#mp-status-banner` (filled by JS: pending → "Your agency is under review"; verified → link to dashboard; rejected/suspended → the `verification_note`).
  - `#mp-profile-form`: `name`, `country`, `city`, `address`, `website`, `year_founded`, `owner_name`; **`services`** checkbox group (values: `flight_tickets`, `candidate_sourcing`, `local_recruitment`, `medical_verification_licensing`, `international_recruitment`, `visa_clearance`, `job_opportunities`); **`cooperation_areas`** checkbox group (values: `have_jobs_want_candidates`, `have_candidates_to_nominate`, `dataflow_licensing_partnership`, `be_your_agent`, `international_partnership`, `urgent_recruitment`, `gulf_market_partnership`, `permanent_recruitment`, `temporary_recruitment`, `new_market_entry`, `visa_clearance`, `flight_booking_for_clients`); file inputs `licence_file` + `company_profile_file`.
  - `#mp-team` (hidden unless `MP.membership.role` ∈ {owner, admin}): members table + `#mp-invite-form` (email + role select).

- [ ] **Step 2: Implement `js/mp-onboarding.js`.**

```js
(function () {
  var SERVICES = ['flight_tickets','candidate_sourcing','local_recruitment','medical_verification_licensing','international_recruitment','visa_clearance','job_opportunities'];
  var COOP = ['have_jobs_want_candidates','have_candidates_to_nominate','dataflow_licensing_partnership','be_your_agent','international_partnership','urgent_recruitment','gulf_market_partnership','permanent_recruitment','temporary_recruitment','new_market_entry','visa_clearance','flight_booking_for_clients'];

  var banner = document.getElementById('mp-status-banner');
  var form = document.getElementById('mp-profile-form');
  var team = document.getElementById('mp-team');

  function q(name) { return form.querySelector('[name="' + name + '"]'); }
  function checks(name) {
    return Array.prototype.map.call(form.querySelectorAll('input[name="' + name + '"]:checked'), function (i) { return i.value; });
  }
  function setChecks(name, vals) {
    (vals || []).forEach(function (v) {
      var el = form.querySelector('input[name="' + name + '"][value="' + v + '"]');
      if (el) el.checked = true;
    });
  }

  async function acceptInviteIfPresent() {
    var token = new URLSearchParams(location.search).get('invite');
    if (!token) return;
    var r = await window.MP.callFn('mp-agency-invite-accept', { token });
    if (r.ok) { location.search = ''; }       // reload without the token
    else if (banner) banner.textContent = (r.data && r.data.error) || 'Invite could not be accepted.';
  }

  function renderBanner() {
    var s = window.MP.status;
    var map = {
      pending_verification: 'Your agency is under review. We’ll email you when it’s verified. You can complete your profile now.',
      verified: 'Your agency is verified.',
      suspended: 'Your agency is suspended. ' + (window.MP.agency && window.MP.agency.verification_note || ''),
      rejected: 'Your agency application was not approved. ' + (window.MP.agency && window.MP.agency.verification_note || ''),
      no_agency: 'No agency found for your account.'
    };
    banner.textContent = map[s] || '';
    if (s === 'verified') {
      var a = document.createElement('a'); a.href = 'partners-dashboard.html'; a.textContent = ' Go to dashboard →';
      banner.appendChild(a);
    }
  }

  function fillForm() {
    var a = window.MP.agency; if (!a) return;
    ['name','country','city','address','website','owner_name'].forEach(function (k) { if (q(k)) q(k).value = a[k] || ''; });
    if (q('year_founded')) q('year_founded').value = a.year_founded || '';
    setChecks('services', a.services);
    setChecks('cooperation_areas', a.cooperation_areas);
  }

  async function uploadIfAny(inputName, purpose) {
    var el = form.querySelector('input[name="' + inputName + '"]');
    if (!el || !el.files || !el.files[0]) return null;
    var file = el.files[0];
    var ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    var path = 'marketplace/agency/' + window.MP.membership.agency_id + '/' + purpose + '/' + purpose + '-' + Date.now() + '.' + ext;
    var up = await window.ghSupabase.storage.from('gh-applicant-documents').upload(path, file, { upsert: true });
    if (up.error) { throw up.error; }
    return path;
  }

  async function saveProfile(e) {
    e.preventDefault();
    var status = document.getElementById('mp-profile-msg');
    status.textContent = 'Saving…';
    try {
      var patch = {
        name: q('name').value.trim(),
        country: q('country').value.trim() || null,
        city: q('city').value.trim() || null,
        address: q('address').value.trim() || null,
        website: q('website').value.trim() || null,
        year_founded: q('year_founded').value ? parseInt(q('year_founded').value, 10) : null,
        owner_name: q('owner_name').value.trim() || null,
        services: checks('services'),
        cooperation_areas: checks('cooperation_areas'),
        updated_at: new Date().toISOString()
      };
      var lic = await uploadIfAny('licence_file', 'licence');
      var prof = await uploadIfAny('company_profile_file', 'company-profile');
      if (lic) patch.licence_file_path = lic;
      if (prof) patch.company_profile_path = prof;

      var r = await window.MP.mpFrom('agencies').update(patch).eq('id', window.MP.membership.agency_id);
      status.textContent = r.error ? ('Save failed: ' + r.error.message) : 'Saved.';
      if (!r.error) { await window.MP.init(); }
    } catch (err) {
      status.textContent = 'Save failed: ' + (err.message || err);
    }
  }

  async function renderTeam() {
    if (!team) return;
    if (['owner','admin'].indexOf(window.MP.membership.role) < 0) { team.hidden = true; return; }
    team.hidden = false;
    var list = document.getElementById('mp-team-list');
    var r = await window.MP.mpFrom('agency_members').select('user_id, role, status').eq('agency_id', window.MP.membership.agency_id);
    list.innerHTML = (r.data || []).map(function (m) {
      return '<tr><td>' + window.MP.esc(m.user_id) + '</td><td>' + window.MP.esc(m.role) + '</td><td>' + window.MP.esc(m.status) + '</td></tr>';
    }).join('') || '<tr><td colspan="3">Just you so far.</td></tr>';

    var inviteForm = document.getElementById('mp-invite-form');
    inviteForm.onsubmit = async function (e) {
      e.preventDefault();
      var im = document.getElementById('mp-invite-msg');
      im.textContent = 'Sending…';
      var fd = new FormData(inviteForm);
      var res = await window.MP.callFn('mp-agency-invite', { email: fd.get('email'), role: fd.get('role') });
      im.textContent = res.ok ? 'Invite sent.' : ((res.data && res.data.error) || 'Invite failed.');
      if (res.ok) inviteForm.reset();
    };
  }

  (async function () {
    await window.MP.init();
    await acceptInviteIfPresent();
    await window.MP.init();
    if (!window.MP.requireAgency({ to: 'partners-signup.html' })) return;
    renderBanner();
    fillForm();
    renderTeam();
    form.addEventListener('submit', saveProfile);
  })();
})();
```

- [ ] **Step 3: Playwright smoke** in `tests/partners.spec.js`: `/partners-onboarding` renders `#mp-profile-form`, the `services` and `cooperation_areas` checkbox groups have the expected counts (7 and 12), no console errors. (Runs unauthenticated → the guard redirect is fine to assert too.)

- [ ] **Step 4: Manual verify.** As the Task 11 throwaway agency: fill profile, tick some services + cooperation areas, upload a small PDF as licence → Save → `execute_sql` shows the arrays + `licence_file_path` set, and the object exists under `marketplace/agency/<id>/licence/`. Invite a second throwaway email → invite row created; open the emailed link as that user → becomes an `active` member.

- [ ] **Step 5: Commit.**

```bash
git add partners-onboarding.html js/mp-onboarding.js tests/partners.spec.js
git commit -m "feat(partners): onboarding — partnership profile (services/cooperation areas/licence upload) + team invites + invite-accept"
```

---

### Task 13: `partners-dashboard.html` + `js/mp-dashboard.js` — post-login landing

**Files:**
- Create: `partners-dashboard.html`
- Create: `js/mp-dashboard.js`

**Interfaces:**
- Consumes: `MP.init()`, `MP.requireAgency()`.
- Behaviour (Chunk 1 scope — deliberately minimal): resolve the agency; show the verification status; if not `verified`, a prominent "Complete your profile / awaiting verification" card linking to `partners-onboarding.html`; if `verified`, a placeholder grid of the coming sections (Jobs, Candidates, Nominations, Messages, Billing) each linking to a `#` for now (wired in later chunks). A left nav shell reused by every future `partners-*` page.

- [ ] **Step 1: Build `partners-dashboard.html`** with the dark shell, a `<nav id="mp-nav">` sidebar (Dashboard / Jobs / Candidates / Nominations / Messages / Billing / Team — non-live items get `aria-disabled`), a `#mp-dash-main`. Script load: `js/supabase-client.js`, `js/mp-core.js`, `js/mp-dashboard.js`.

- [ ] **Step 2: Implement `js/mp-dashboard.js`.**

```js
(function () {
  var main = document.getElementById('mp-dash-main');

  (async function () {
    await window.MP.init();
    if (!window.MP.requireAgency({ to: 'partners-signup.html' })) return;

    var a = window.MP.agency;
    if (window.MP.status !== 'verified') {
      main.innerHTML =
        '<div class="mp-card"><h2>' + window.MP.esc(a ? a.name : 'Your agency') + '</h2>' +
        '<p>Status: <strong>' + window.MP.esc(window.MP.status) + '</strong></p>' +
        '<p>' + (window.MP.status === 'pending_verification'
          ? 'Your agency is under review. Complete your partnership profile while you wait.'
          : window.MP.esc(a && a.verification_note || 'Contact support.')) + '</p>' +
        '<a class="mp-btn" href="partners-onboarding.html">Open partnership profile</a></div>';
      return;
    }

    main.innerHTML =
      '<div class="mp-card"><h2>Welcome, ' + window.MP.esc(a.name) + '</h2>' +
      '<p>Your agency is verified. The marketplace sections below open as they ship.</p></div>' +
      '<div class="mp-grid">' +
      ['Jobs','Candidates','Nominations','Messages','Billing'].map(function (s) {
        return '<div class="mp-tile mp-tile--soon"><h3>' + s + '</h3><span>Coming soon</span></div>';
      }).join('') + '</div>';
  })();
})();
```

- [ ] **Step 3: Playwright smoke:** `/partners-dashboard` unauthenticated → redirected to `login.html` (assert URL). Add an authenticated variant only if the test harness already has a partner session helper; otherwise leave the manual check.

- [ ] **Step 4: Manual verify.** As the verified Task 8 agency → dashboard shows the "verified" welcome + tiles. As a `pending_verification` agency → the profile CTA card.

- [ ] **Step 5: Commit.**

```bash
git add partners-dashboard.html js/mp-dashboard.js tests/partners.spec.js
git commit -m "feat(partners): partners-dashboard landing (status-aware; nav shell for later chunks)"
```

---

### Task 14: Admin — `recruiters.html` Agencies tab + `js/mp-agencies-admin.js`

**Files:**
- Modify: `recruiters.html` (add a sidebar/tab entry + an `#tab-agencies` panel, mirroring the existing tab structure)
- Create: `js/mp-agencies-admin.js`
- Modify: `recruiters.html` `<script>` list — add `js/mp-agencies-admin.js` after the existing admin scripts

**Interfaces:**
- Consumes: `window.ghFrom` (admin session already established by `recruiters.html`'s `js/auth-guard.js` + `data-auth-role="admin"`), `ghSupabase.functions` via a small `callFn` (or fetch), `ghSupabase.storage…createSignedUrl`.
- Behaviour: table of `gh_mp_agencies` with a status filter (`pending_verification` default); row → detail drawer showing profile fields, `services`/`cooperation_areas`, signed links to `licence_file_path` / `company_profile_path`, member count; buttons **Verify / Reject / Suspend** (Reject/Suspend prompt for a note) → `mp-agency-verify`; on success, refresh the row.

- [ ] **Step 1: Confirm the tab pattern.** Open `recruiters.html`; note how existing tabs are declared (sidebar `<a data-tab="…">` + `<div class="…" id="tab-…">`) and how `js/recruiters-admin.js` switches them. Mirror exactly. Add `data-tab="tab-agencies"` nav item labelled "Partner Agencies" and an empty `#tab-agencies` panel with `<select id="mp-ag-filter">` (options: pending_verification / verified / suspended / rejected / all), `<div id="mp-ag-list">`, `<div id="mp-ag-drawer" hidden>`.

- [ ] **Step 2: Implement `js/mp-agencies-admin.js`.**

```js
(function () {
  var sb = window.ghSupabase;
  var listEl = document.getElementById('mp-ag-list');
  var drawer = document.getElementById('mp-ag-drawer');
  var filter = document.getElementById('mp-ag-filter');
  if (!listEl) return;

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }

  async function callVerify(agency_id, action, note) {
    var s = await sb.auth.getSession();
    var token = s.data.session ? s.data.session.access_token : null;
    var res = await fetch(sb.supabaseUrl + '/functions/v1/mp-agency-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': sb.supabaseKey, 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ agency_id: agency_id, action: action, note: note })
    });
    return res.json();
  }

  async function load() {
    var qy = sb.from('gh_mp_agencies').select('*').order('created_at', { ascending: false });
    if (filter.value !== 'all') qy = qy.eq('status', filter.value);
    var r = await qy;
    listEl.innerHTML = (r.data || []).map(function (a) {
      return '<tr data-id="' + a.id + '"><td>' + esc(a.name) + '</td><td>' + esc(a.country || '') +
        '</td><td>' + esc(a.status) + '</td><td>' + esc((a.created_at || '').slice(0, 10)) +
        '</td><td><button class="mp-ag-open" data-id="' + a.id + '">Review</button></td></tr>';
    }).join('') || '<tr><td colspan="5">No agencies.</td></tr>';
  }

  async function openDrawer(id) {
    var r = await sb.from('gh_mp_agencies').select('*').eq('id', id).single();
    var a = r.data; if (!a) return;
    var mc = await sb.from('gh_mp_agency_members').select('user_id', { count: 'exact', head: true }).eq('agency_id', id);
    async function signed(path) {
      if (!path) return '';
      var s = await sb.storage.from('gh-applicant-documents').createSignedUrl(path, 600);
      return s.data ? '<a href="' + s.data.signedUrl + '" target="_blank" rel="noopener">open</a>' : '';
    }
    drawer.hidden = false;
    drawer.innerHTML =
      '<h3>' + esc(a.name) + '</h3>' +
      '<p>' + esc(a.city || '') + ' ' + esc(a.country || '') + ' · founded ' + esc(a.year_founded || '?') + '</p>' +
      '<p>Website: ' + esc(a.website || '—') + ' · Owner: ' + esc(a.owner_name || '—') + '</p>' +
      '<p>Members: ' + (mc.count || 0) + '</p>' +
      '<p>Services: ' + esc((a.services || []).join(', ') || '—') + '</p>' +
      '<p>Cooperation: ' + esc((a.cooperation_areas || []).join(', ') || '—') + '</p>' +
      '<p>Licence: ' + (await signed(a.licence_file_path) || '—') +
      ' · Company profile: ' + (await signed(a.company_profile_path) || '—') + '</p>' +
      (a.verification_note ? '<p>Note: ' + esc(a.verification_note) + '</p>' : '') +
      '<div class="mp-ag-actions">' +
      '<button data-act="verify">Verify</button> ' +
      '<button data-act="reject">Reject</button> ' +
      '<button data-act="suspend">Suspend</button></div>' +
      '<p id="mp-ag-drawer-msg"></p>';
    drawer.querySelectorAll('.mp-ag-actions button').forEach(function (b) {
      b.onclick = async function () {
        var act = b.getAttribute('data-act');
        var note = (act === 'verify') ? undefined : (window.prompt(act + ' note (shown to the agency):') || '');
        document.getElementById('mp-ag-drawer-msg').textContent = 'Working…';
        var out = await callVerify(id, act, note);
        document.getElementById('mp-ag-drawer-msg').textContent = out.error ? ('Error: ' + out.error) : ('Done: ' + out.status);
        if (!out.error) { await load(); }
      };
    });
  }

  filter.addEventListener('change', load);
  listEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.mp-ag-open'); if (btn) openDrawer(btn.getAttribute('data-id'));
  });

  // hook into the page's tab-switch: load when #tab-agencies becomes visible
  document.addEventListener('click', function (e) {
    var nav = e.target.closest('[data-tab="tab-agencies"]');
    if (nav) setTimeout(load, 0);
  });
  if (location.hash === '#tab-agencies') load();
})();
```

- [ ] **Step 3: Playwright smoke** (admin pages need a session — if `tests/` already has an admin-login helper, use it; else a manual check): the Agencies tab renders the filter + an empty/among-rows table without console errors.

- [ ] **Step 4: Manual verify (the acceptance path for signup→verify).** Log in as a GlobalHire admin → Partner Agencies tab → the Task 11 throwaway agency shows as `pending_verification` → open drawer, licence link opens the uploaded PDF → click **Verify** → agency row flips to `verified`, the owner gets the "verified" email, and that owner can now sign in and reach `partners-dashboard.html` (was blocked while `email_confirm=false`). Click **Suspend** with a note → status + note update; the owner's next `partners-dashboard` visit shows the suspended card.

- [ ] **Step 5: Commit.**

```bash
git add recruiters.html js/mp-agencies-admin.js
git commit -m "feat(admin): Partner Agencies tab — verification queue + review drawer + verify/reject/suspend"
```

---

### Task 15: RLS isolation acceptance gate + Playwright run + deploy

**Files:**
- Create: `tests/rls/mp-isolation.sql`
- Modify: `tests/partners.spec.js` (final consolidation)

**Interfaces:**
- Consumes: everything from Tasks 1–14.
- Produces: a runnable SQL script that a reviewer executes via the Supabase MCP `execute_sql` (wrapped in `BEGIN … ROLLBACK`) proving cross-agency isolation. **This script is the chunk's acceptance gate and is re-run by every later chunk that adds an `mp_*` table.**

- [ ] **Step 1: Write `tests/rls/mp-isolation.sql`.**

```sql
-- tests/rls/mp-isolation.sql
-- Cross-agency isolation proof for the Partner Marketplace tenancy layer.
-- Run via Supabase MCP execute_sql. It rolls itself back — no data persists.
BEGIN;

-- two synthetic users
--   userA = 00000000-0000-0000-0000-00000000000a
--   userB = 00000000-0000-0000-0000-00000000000b
INSERT INTO globalhire.mp_agencies (id, name, status, created_by)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Agency A', 'verified', '00000000-0000-0000-0000-00000000000a'),
       ('bbbbbbbb-0000-0000-0000-000000000002', 'Agency B', 'verified', '00000000-0000-0000-0000-00000000000b');
INSERT INTO globalhire.mp_agency_members (agency_id, user_id, role, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner', 'active'),
       ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'owner', 'active');
INSERT INTO globalhire.mp_agency_invites (agency_id, email, role, token, invited_by, expires_at)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'x@a.com', 'member', 'tok-a', '00000000-0000-0000-0000-00000000000a', now() + interval '7 days');

-- Act as userA
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- 1. sees only Agency A
SELECT 'agencies_visible' AS check, array_agg(name ORDER BY name) AS got
FROM public.gh_mp_agencies;                      -- expect {"Agency A"}

-- 2. cannot read Agency B members
SELECT 'b_members_visible' AS check, count(*) AS got
FROM public.gh_mp_agency_members
WHERE agency_id = 'bbbbbbbb-0000-0000-0000-000000000002';   -- expect 0

-- 3. cannot verify/flip another agency
UPDATE public.gh_mp_agencies SET status = 'suspended'
WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';          -- expect 0 rows

-- 4. cannot flip own protected column (column guard)
DO $$ BEGIN
  BEGIN
    UPDATE globalhire.mp_agencies SET status = 'verified'
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
    RAISE NOTICE 'FAIL: own status update was allowed';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'PASS: own status update blocked (%).', SQLERRM;
  END;
END $$;

-- 5. invites: sees A's, not by cross-agency
SELECT 'invites_visible' AS check, count(*) AS got FROM public.gh_mp_agency_invites;  -- expect 1

-- 6. ai_runs: non-admin sees nothing
SELECT 'ai_runs_visible' AS check, count(*) AS got FROM public.gh_mp_ai_runs;         -- expect 0

RESET role;
ROLLBACK;
```

- [ ] **Step 2: Run the gate.** Execute the script via `execute_sql`. **All six checks must match their expected values** (agencies_visible = {"Agency A"}, b_members_visible = 0, the UPDATE affects 0 rows, check 4 prints PASS, invites_visible = 1, ai_runs_visible = 0). If any fails, fix the offending migration's policy and re-run — do not proceed.

- [ ] **Step 3: Run the full Playwright suite.** `npx playwright test tests/partners.spec.js` → all page smokes green.

- [ ] **Step 4: Deploy.**

```bash
# functions (from repo root, supabase CLI linked to evzhnsugmvtqgmvzwyix)
supabase functions deploy mp-agency-register mp-agency-verify mp-agency-invite mp-agency-invite-accept --project-ref evzhnsugmvtqgmvzwyix
# site
git push origin design/partner-marketplace     # or merge to main per the team's flow
vercel --prod
```

- [ ] **Step 5: Post-deploy smoke on production.** `https://globalhire.elabsolution.org/partners-signup` → register a throwaway agency → admin verifies it in `recruiters.html` → the owner logs in and reaches `partners-dashboard.html`. Then delete the throwaway (`auth.admin.deleteUser` → cascade).

- [ ] **Step 6: Commit + update the progress note.**

```bash
git add tests/rls/mp-isolation.sql tests/partners.spec.js
git commit -m "test(partners): mp_* cross-agency isolation acceptance gate + Playwright smokes; chunk 1 complete"
```

Append to `.superpowers/sdd/progress.md` (or create `docs/superpowers/plans/partner-marketplace-progress.md`): "Chunk 1 (tenancy + verification) complete — schema v30–v34, 4 edge fns, partners-signup/onboarding/dashboard, admin Agencies tab. mp-isolation.sql gate green."

---

## Self-review

**Spec coverage (spec §12 chunk 1 line):**
- `mp_agencies` / `mp_agency_members` / `mp_agency_invites` + views + RLS → Tasks 1, 2 ✓
- recruiter→agency migration → Task 4 ✓
- `partners-signup` + `mp-agency-register` → Tasks 7, 11 ✓
- `partners-onboarding` (partnership profile) + team invites → Tasks 9, 12 ✓
- admin **Agencies** tab in `recruiters.html` + `mp-agency-verify` → Tasks 8, 14 ✓
- `_shared/mp-ai.ts` skeleton + `mp_ai_runs` → Tasks 3, 6 ✓
- Acceptance: `mp_*` RLS test script → Task 15 ✓
- Storage RLS for the marketplace path (spec §4.4 pt 1 / §5.3 / §11) → Task 5 ✓
- `partners-dashboard` (spec §11 partner pages) → Task 13 ✓
- `js/mp-core.js` bootstrap (implied by every partner page in §11) → Task 10 ✓
- Services / cooperation-areas taxonomy (spec §4.2) → Task 12 step 1 ✓

**Not in this chunk (correctly deferred to later chunk plans):** jobs, candidates, nominations, claims, matching, screening, comms, pipeline, ledger, messaging — spec §12 chunks 2–11.

**Placeholder scan:** no "TBD"/"handle errors"/"similar to Task N" — every step has literal SQL or code. Email HTML is intentionally plain-text `text:` sends in Chunk 1 (the branded `gh-email-shell.ts` shell is wired in the notifications chunk, spec §8.3); noted where it occurs.

**Type consistency:** `MP.mpFrom` / `MP.callFn` / `MP.init` / `MP.status` / `MP.membership` / `MP.agency` used identically in Tasks 10–13. Edge-fn exports `validateRegisterBody` / `validateVerifyBody` / `validateInviteBody` / `inviteExpiry` match their tests. `my_agency_ids()` signature identical in Tasks 1, 2, 3, 5. Status enums (`pending_verification|verified|suspended|rejected`) identical in the migration CHECK, `mp-agency-verify` `STATUS_FOR`, and `mp-core.js`/`mp-onboarding.js`/`mp-dashboard.js` banner maps.

**Assumptions the executor must confirm before Task 1 (noted in steps):** last schema file is `schema-v29-*` (→ start v30); `globalhire.is_admin()` exists; `globalhire.profiles` has `organization_name` + `country_of_origin` + `recruiter_approved` (seen in `recruiter-register/index.ts`); `ghSupabase.supabaseUrl` / `.supabaseKey` props exist on the loaded Supabase JS build (Task 10 step 2 has the fallback).
