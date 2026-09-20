# Partner Marketplace Chunk 2A — Job Board (S2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GlobalHire staff can create, publish, pause and close vacancies; verified partner agencies can browse and filter the open ones.

**Architecture:** One new table `mp_jobs` in the `globalhire` schema behind a `gh_mp_jobs` `security_invoker` view, following the tenancy and grant discipline established in Chunks 1 and 10. Jobs are **not** agency-owned — they belong to GlobalHire — so the RLS shape differs from every existing `mp_*` table: admins see everything, any active agency member sees only `status = 'open'`. All writes go through an admin-only edge function; `authenticated` gets SELECT only. The view masks `employer_name` when `employer_confidential` is set and the caller is not an admin.

**Tech Stack:** Postgres 15 / Supabase (`evzhnsugmvtqgmvzwyix`) · Deno edge functions · vanilla ES5-style browser JS (no framework, no bundler) · Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-globalhire-partner-marketplace-design.md` — §5.2 (table), §6.1 (UX), §9 (security).

## Global Constraints

- **Migration file is `schema-v42-mp-jobs.sql`.** v41 is the highest in use.
- **Apply migrations with `supabase db query --linked -f <file>`.** NEVER `supabase db push` — remote migration history for this project is empty.
- **Deploy functions separately:** `supabase functions deploy <name>`.
- **Explicit `REVOKE ALL ... FROM anon, authenticated` before every GRANT.** Supabase stamps default privileges at table-creation time.
- **On FUNCTIONS, `REVOKE ALL ... FROM public` also strips the implicit grant `service_role` relies on.** `schema-v40b` did exactly this and left two edge functions uncallable by anyone in production, undetected by unit tests, the RLS gate and three code reviews. Any function this plan creates that a service-role caller must execute gets an explicit `GRANT EXECUTE ... TO service_role`. Verify with `has_function_privilege('service_role', oid, 'EXECUTE')`, not by reading the SQL.
- **Every SECURITY DEFINER function carries `SET search_path = ''`** and fully qualifies everything it touches.
- **`authenticated` gets SELECT only on `mp_jobs`.** No INSERT/UPDATE/DELETE. Every write goes through `mp-job-write`, which re-checks `globalhire.is_admin()` server-side.
- **Partner visibility is `status = 'open'` only.** A draft, paused, filled or closed job must be invisible to a partner, proven by the isolation gate — not merely filtered in the UI.
- **`employer_name` is masked in `gh_mp_jobs` when `employer_confidential = true` and the caller is not an admin.** The mask lives in the view, not the page script.
- **Browser code: `MP.esc()` for element text, `MP.escAttr()` for attribute values, `MP.safeHref()` for any href built from data.** This branch's predecessor produced seven injection defects of these classes; `js/mp-core.js` carries the contract comment explaining which to use where.
- **No AI in this chunk.** `mp_match_scores` (S5) does not exist, so there is no "N of your candidates match" badge. Do not stub one.
- **No Nominate button in this chunk.** Nomination is Chunk 2C. Leave no dead button and no disabled placeholder.

---

### Task 1: Migration — `mp_jobs`, RLS, grants, masking view

**Files:**
- Create: `schema-v42-mp-jobs.sql`

**Interfaces:**
- Consumes: `globalhire.my_agency_ids()`, `globalhire.is_admin()` (schema-v30).
- Produces: table `globalhire.mp_jobs`; view `public.gh_mp_jobs`.

- [ ] **Step 1: Write the migration**

```sql
-- schema-v42-mp-jobs.sql
-- Partner Marketplace S2: the job board.
-- Spec: docs/superpowers/specs/2026-09-03-globalhire-partner-marketplace-design.md §5.2, §6.1, §9
BEGIN;

CREATE TABLE globalhire.mp_jobs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                  text NOT NULL,
  employer_name          text,
  employer_confidential  boolean NOT NULL DEFAULT false,
  destination_country    text,
  city                   text,
  specialty              text,
  subspecialty           text,
  seniority_level        text,
  contract_type          text CHECK (contract_type IN ('permanent','locum','temporary')),
  facility_type          text,
  positions_count        int NOT NULL DEFAULT 1 CHECK (positions_count > 0),
  salary_min             numeric,
  salary_max             numeric,
  salary_currency        text,
  salary_display         text,
  benefits               text[] NOT NULL DEFAULT '{}',
  jd_text                text,
  status                 text NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','open','paused','filled','closed')),
  placement_fee_amount   numeric,
  placement_fee_currency text,
  partner_split_pct      numeric NOT NULL DEFAULT 50
                           CHECK (partner_split_pct >= 0 AND partner_split_pct <= 100),
  source                 text NOT NULL DEFAULT 'internal'
                           CHECK (source IN ('internal','employer','imported')),
  origin_campaign_id     uuid,
  min_experience_years   int,
  required_licences      text[] NOT NULL DEFAULT '{}',
  required_exams         text[] NOT NULL DEFAULT '{}',
  nationality_prefs      text[] NOT NULL DEFAULT '{}',
  gender_pref            text,
  age_min                int,
  age_max                int,
  language_reqs          text[] NOT NULL DEFAULT '{}',
  extra_criteria         jsonb NOT NULL DEFAULT '{}'::jsonb,
  posted_by              uuid NOT NULL,
  published_at           timestamptz,
  closes_at              timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mp_jobs_open_idx ON globalhire.mp_jobs (published_at DESC) WHERE status = 'open';
CREATE INDEX mp_jobs_status_idx ON globalhire.mp_jobs (status, created_at DESC);

ALTER TABLE globalhire.mp_jobs ENABLE ROW LEVEL SECURITY;

-- Jobs belong to GlobalHire, not to an agency, so this is NOT the my_agency_ids()
-- predicate used by every other mp_* table. An admin sees everything; an active
-- member of ANY verified agency sees only open jobs.
CREATE POLICY mp_jobs_admin_all ON globalhire.mp_jobs
  FOR ALL TO authenticated
  USING (globalhire.is_admin()) WITH CHECK (globalhire.is_admin());

CREATE POLICY mp_jobs_partner_open_select ON globalhire.mp_jobs
  FOR SELECT TO authenticated
  USING (
    status = 'open'
    AND EXISTS (SELECT 1 FROM globalhire.my_agency_ids())
  );

-- Masking lives in the view so no page script can leak a confidential employer.
CREATE VIEW public.gh_mp_jobs WITH (security_invoker = true) AS
  SELECT
    j.id, j.title,
    CASE WHEN j.employer_confidential AND NOT globalhire.is_admin()
         THEN NULL ELSE j.employer_name END AS employer_name,
    j.employer_confidential,
    j.destination_country, j.city, j.specialty, j.subspecialty, j.seniority_level,
    j.contract_type, j.facility_type, j.positions_count,
    j.salary_min, j.salary_max, j.salary_currency, j.salary_display,
    j.benefits, j.jd_text, j.status,
    j.placement_fee_amount, j.placement_fee_currency, j.partner_split_pct,
    j.source, j.origin_campaign_id,
    j.min_experience_years, j.required_licences, j.required_exams,
    j.nationality_prefs, j.gender_pref, j.age_min, j.age_max,
    j.language_reqs, j.extra_criteria,
    j.posted_by, j.published_at, j.closes_at, j.created_at, j.updated_at
  FROM globalhire.mp_jobs j;

REVOKE ALL ON globalhire.mp_jobs FROM anon, authenticated;
REVOKE ALL ON public.gh_mp_jobs  FROM anon, authenticated;
GRANT SELECT ON globalhire.mp_jobs TO authenticated;
GRANT SELECT ON public.gh_mp_jobs  TO authenticated;

COMMIT;
```

- [ ] **Step 2: Apply it**

Run: `supabase db query --linked -f schema-v42-mp-jobs.sql`
Expected: no error output.

- [ ] **Step 3: Verify the grant posture**

Run:
```bash
supabase db query --linked "
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
from information_schema.role_table_grants
where table_name in ('mp_jobs','gh_mp_jobs') and grantee in ('anon','authenticated')
group by 1,2 order by 1,2;"
```
Expected: `anon` on **no** row; `authenticated` showing `SELECT` only on both.

- [ ] **Step 4: Commit**

```bash
git add schema-v42-mp-jobs.sql
git commit -m "feat(db): mp_jobs + RLS, grants, employer-masking view (S2)"
```

---

### Task 2: Isolation gate for the job board

**Files:**
- Create: `tests/rls/mp-jobs-isolation.sql`

**Interfaces:**
- Consumes: Task 1.
- Produces: a 6-check PASS/FAIL gate in the idiom of `tests/rls/mp-messaging-isolation.sql` — assertions funnelled through `set_config`/`current_setting` into ONE final SELECT, because `supabase db query` returns only the last result set.

**Why each check exists — read before writing, these are the properties that can silently break:**

- A partner seeing a `draft` job would leak an unpublished vacancy.
- A partner seeing a confidential employer's name would breach the confidentiality promise the toggle makes.
- A partner writing a job at all would let an agency post its own vacancies, which Phase 1 explicitly excludes.
- A **positive control** is mandatory on every "sees nothing" check — a `count = 0` proves nothing unless the same query can return rows under other conditions. The predecessor branch shipped a vacuous check that would have passed with the policy wide open.

- [ ] **Step 1: Write the gate**

Fixtures: two agencies (A verified with an active member, B irrelevant), and four jobs — one `open` non-confidential, one `open` confidential, one `draft`, one `closed`.

Checks, each PASS/FAIL into `chk.*`:
1. `partner_sees_only_open` — as A's member, `count(*) FROM public.gh_mp_jobs` equals exactly the number of `open` jobs (2), not 4.
2. `partner_cannot_see_draft` — as A's member, selecting the draft job by its literal id returns 0 rows. **Positive control:** the same shape against the open job's id returns 1.
3. `confidential_employer_masked` — as A's member, `employer_name` for the confidential job IS NULL. **Positive control:** `employer_name` for the non-confidential open job is NOT NULL.
4. `admin_sees_all_and_unmasked` — as an admin, `count(*)` is 4 AND the confidential job's `employer_name` is NOT NULL.
5. `partner_cannot_write` — an INSERT into `public.gh_mp_jobs` as A's member is refused. Capture SQLSTATE and assert it is `42501`, failing with the actual SQLSTATE otherwise, so an unrelated error cannot read as a pass.
6. `anon_denied` — `RESET role;` then `SET LOCAL role anon;` (the reset is required — `authenticated` → `anon` is not a permitted direct transition for a non-superuser and aborts the script before its final SELECT), then a select is refused with SQLSTATE `42501`.

Wrap in `BEGIN` with no `COMMIT`, ending in `ROLLBACK`. It runs against production; fixtures must not persist.

- [ ] **Step 2: Run it — all six must PASS**

Run: `supabase db query --linked -f tests/rls/mp-jobs-isolation.sql`
Expected: six rows, every `result` starting `PASS`. **A single FAIL blocks this task** — fix the policy, never the test.

- [ ] **Step 3: Confirm no fixtures persisted**

Run: `supabase db query --linked "select count(*) as leftover from globalhire.mp_jobs;"`
Expected: `0` (no real jobs exist yet).

- [ ] **Step 4: Re-run the two existing gates — no regression**

```bash
supabase db query --linked -f tests/rls/mp-isolation.sql
supabase db query --linked -f tests/rls/mp-messaging-isolation.sql
```
Expected: 12/12 and 6/6. New grants can silently change what an existing gate proves; that is why this runs now rather than at the end.

- [ ] **Step 5: Commit**

```bash
git add tests/rls/mp-jobs-isolation.sql
git commit -m "test(db): job-board isolation gate — draft hidden, employer masked, no partner writes"
```

---

### Task 3: `mp-job-write` edge function

**Files:**
- Create: `supabase/functions/mp-job-write/index.ts`
- Create: `supabase/functions/mp-job-write/index_test.ts`

**Interfaces:**
- Consumes: Task 1's table.
- Produces: `POST /functions/v1/mp-job-write` `{id?, ...jobFields}` → `{success:true, id}`. Exports `validateJobBody(raw)` → `{ok:true,value}|{ok:false,error}`.

**Shape to follow:** `supabase/functions/mp-thread-create/index.ts` is the house pattern — same CORS block, `json()` helper, service/user client split, and the admin check `svc.from('gh_profiles').select('role').eq('id', user.id).single()` then `role === 'admin'`. Read it first; gratuitous divergence is a defect.

- [ ] **Step 1: Write the failing test**

Cases:
- rejects a missing `title`
- rejects an unknown `contract_type`
- rejects an unknown `status`
- rejects `partner_split_pct` above 100 and below 0
- rejects `positions_count` of 0
- builds its result **field by field**, so an unexpected key in the request body (e.g. `posted_by`, `created_at`) cannot reach the insert — assert `Object.hasOwn(r.value, 'posted_by') === false`
- accepts a minimal valid body

- [ ] **Step 2: Run it, see it fail** — `deno test --allow-all supabase/functions/mp-job-write/index_test.ts`, expect module-not-found.

- [ ] **Step 3: Implement**

Admin-only: 401 without a JWT, 403 when `role !== 'admin'`. Uses the **service-role** client for the upsert and the user client only for `auth.getUser()`. `posted_by` is set from the verified JWT's user id, never from the body. When `status` transitions to `open` and `published_at` is null, set `published_at = now()`. Always sets `updated_at`.

- [ ] **Step 4: Run the test — must pass.**

- [ ] **Step 5: Deploy and commit**

```bash
supabase functions deploy mp-job-write
git add supabase/functions/mp-job-write/
git commit -m "feat(fn): mp-job-write — admin-only job create/edit, server-set posted_by"
```

---

### Task 4: Admin job board — `admin-mp-jobs.html`

**Files:**
- Create: `admin-mp-jobs.html`, `js/mp-jobs-admin.js`
- Modify: the shared admin sidebar block in `admin-mp-agencies.html`, `admin-mp-messages.html`, `recruiters.html`, `dashboard.html`

**Interfaces:**
- Consumes: `gh_mp_jobs` (read), `mp-job-write` (write), `MP.*` from `js/mp-core.js`.

- [ ] **Step 1: Build the page** on the `admin-mp-messages.html` shell (`<body data-auth-role="admin">` is what `js/auth-guard.js` enforces — keep it). A status filter defaulting to `open`, a table of jobs, and a create/edit drawer carrying the structured-criteria form from spec §6.1.

- [ ] **Step 2: Write `js/mp-jobs-admin.js`.** Admins have **no agency membership**, so `MP.init()` resolves to `no_agency` for them — do NOT call `MP.requireAgency()`/`requireVerified()`, which would bounce staff to the partner signup page. `MP.mpFrom()` needs no membership.

Every interpolation into markup uses `MP.esc` (text) / `MP.escAttr` (attributes) / `MP.safeHref` (hrefs). `employer_name`, `title`, `city` and `jd_text` are all free text.

- [ ] **Step 3: Add the "Jobs" sidebar entry** to every admin page carrying the shared sidebar, or the nav becomes inconsistent between pages.

- [ ] **Step 4: Verify** — `node --check` on the JS; serve locally and confirm the page returns 200 and redirects to `login.html` when signed out. Paste literal output.

- [ ] **Step 5: Commit**

```bash
git add admin-mp-jobs.html js/mp-jobs-admin.js admin-mp-agencies.html admin-mp-messages.html recruiters.html dashboard.html
git commit -m "feat(admin): job board — create, publish, pause, close"
```

---

### Task 5: Partner job board — `partners-jobs.html` + `partners-job.html`

**Files:**
- Create: `partners-jobs.html`, `partners-job.html`, `js/mp-jobs-partner.js`
- Modify: `js/mp-dashboard.js` (nav link)

**Interfaces:**
- Consumes: `gh_mp_jobs`, `MP.*`.

- [ ] **Step 1: Build both pages** on the `partners-messages.html` shell. List view: open jobs with filters (specialty, country, city, seniority, contract type). Detail view: full requirements, fee and split visible, `jd_text`.

- [ ] **Step 2: Write `js/mp-jobs-partner.js`.** Available at **any** agency status including `pending_verification` — a pending agency should be able to see what it is applying to work on. `MP.init()` once per load; on `MP.status === 'error'` render in-page rather than redirecting.

**When `employer_name` is null, render "Employer confidential" — do not render an empty field.** The value is masked by the view, so the page must not infer anything from its absence beyond that.

**No Nominate button.** Nomination is Chunk 2C. Do not add a disabled one.

- [ ] **Step 3: Verify** — `node --check`; both pages 200; signed-out redirects to `login.html`. Paste literal output.

- [ ] **Step 4: Commit**

```bash
git add partners-jobs.html partners-job.html js/mp-jobs-partner.js js/mp-dashboard.js
git commit -m "feat(partners): browse and filter open jobs"
```

---

### Task 6: End-to-end and production smoke

**Files:**
- Modify: `tests/partners.spec.js`

- [ ] **Step 1: Write the round trip** — admin creates a draft job → it is invisible to a partner → admin publishes → partner sees it → admin pauses → partner no longer sees it. Gate on the `E2E_*` env vars with `test.skip()` and an explicit reason when absent (they are currently unset), never a silently-passing empty test.

- [ ] **Step 2: Live backend smoke without browser credentials** — using throwaways you create and destroy: insert a draft job via `mp-job-write` as an admin, confirm a partner JWT cannot see it, publish it, confirm the partner now can, and confirm a confidential job's `employer_name` reads NULL for the partner and non-null for an admin. Paste literal output for each assertion, then delete everything and prove zero leftovers.

- [ ] **Step 3: Grep production for leaked paths** in `jd_text` and `extra_criteria` — `/Users/` or `~/`. Report the count even if zero.

- [ ] **Step 4: Commit**

```bash
git add tests/partners.spec.js
git commit -m "test(partners): job publish/visibility round trip"
```

---

## Self-Review

**Spec coverage:** §5.2's table → Task 1 (every column present). §6.1's admin surface → Task 4; partner surface → Task 5. §9's employer masking → Task 1's view, proven by Task 2 check 3. **Deliberately out of scope, per the chunk split:** the "N of your candidates match" badge (needs `mp_match_scores`, S5) and the Nominate button (needs S3/S4) — both noted in Global Constraints so no implementer stubs them.

**Type consistency:** `validateJobBody` returns a field-by-field object with no `posted_by`; Task 3's implementation sets `posted_by` from the JWT. `gh_mp_jobs` exposes `employer_name` as nullable, and Task 5 renders "Employer confidential" on null.

**Known risk, called out deliberately:** the RLS shape here is the **first** in this codebase that is not the `my_agency_ids()` tenancy predicate — jobs are GlobalHire-owned, so partner visibility is `status = 'open' AND caller belongs to some agency`. That is a new policy shape, which is exactly where the previous chunk's worst defect lived. Task 2's gate exists to prove it rather than assume it, and check 2 carries a positive control so a wide-open or fully-closed policy cannot both read as a pass.
