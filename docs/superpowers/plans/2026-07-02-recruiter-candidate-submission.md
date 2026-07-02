# Recruiter Candidate Submission & Admin Review — Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let approved recruiters upload their own candidates (with documents) in the GlobalHire portal; let GlobalHire admins review each submission tagged by source recruiter, set a status, and message the recruiter back — with the recruiter seeing that status in-portal and by email.

**Architecture:** All in the GlobalHire system (Supabase `evzhnsugmvtqgmvzwyix`, repo GLOBALHIRE@ELAB). Data in the `globalhire` schema exposed via `public.gh_*` views (existing convention); recruiter/admin UIs are vanilla-JS IIFEs talking to Supabase via `window.ghSupabase` / `ghFrom()`. Documents reuse the `gh-applicant-documents` storage bucket. Feature B (campaign exclusion) is a separate plan.

**Tech stack:** Static HTML + vanilla JS, Supabase JS v2, Postgres RLS, Supabase Storage, Supabase Edge Functions (Deno) for email. Verification via the repo's Playwright setup (`playwright.config.js`, `tests/`) + manual smoke, matching existing patterns (this repo does not unit-test DOM IIFEs).

## Global Constraints
- Tables live in schema `globalhire`; expose each via a `public.gh_<name>` view; front-end reads through `ghFrom('<name>')` (→ `gh_<name>`). Copy this pattern from `globalhire.profiles` → `public.gh_profiles`.
- RLS on every new table. Admin check = `globalhire.is_admin()` (already exists). Recruiter owns rows where `recruiter_id = auth.uid()`.
- Never expose another recruiter's candidates to a recruiter. RLS review is a gating step before go-live.
- Storage bucket: `gh-applicant-documents`, path `recruiter-clients/{recruiter_id}/{client_id}/{doc_type}-{ts}.{ext}`.
- Deploy: commit changed served files; `.vercelignore` excludes `docs/`, `supabase/`. Site auto-deploys on push to `main` (Vercel git integration) + `vercel --prod` for immediacy. Clean URLs (`.html` redirects).
- Approved recruiters only: gate the "My Candidates" UI on `recruiter_approved = true` (same as existing portal).

---

### Task 1: Normalize `recruiter_clients` into the `globalhire` schema + review columns + docs table + RLS

**Files:**
- Create: `schema-v18-recruiter-clients.sql` (migration, applied via Supabase MCP `apply_migration`)

**Interfaces:**
- Produces: `globalhire.recruiter_clients` (base), `public.gh_recruiter_clients` (view), `globalhire.recruiter_client_documents` (base), `public.gh_recruiter_client_documents` (view). Front-end uses `ghFrom('recruiter_clients')`, `ghFrom('recruiter_client_documents')`.
- Column set on `recruiter_clients`: existing (`id, recruiter_id, full_name, email, phone, profession, specialty, experience_years, current_country, target_countries, passport_number, license_number, status, profile_data, created_at, updated_at`) + NEW `admin_status text not null default 'submitted' check (admin_status in ('submitted','under_review','shortlisted','placed','rejected'))`, `admin_note text`, `reviewed_by uuid`, `reviewed_at timestamptz`, `promoted_profile_id uuid`.

- [ ] **Step 1: Confirm current object.** `recruiter_clients` is today a bare `public` base table (0 rows). Decide: recreate in `globalhire` schema (0 rows → safe to move). 
- [ ] **Step 2: Write migration** — `ALTER TABLE public.recruiter_clients SET SCHEMA globalhire;` then `ALTER TABLE globalhire.recruiter_clients ADD COLUMN admin_status text NOT NULL DEFAULT 'submitted' CHECK (...), ADD COLUMN admin_note text, ADD COLUMN reviewed_by uuid, ADD COLUMN reviewed_at timestamptz, ADD COLUMN promoted_profile_id uuid;`. Create `globalhire.recruiter_client_documents (id uuid pk default gen_random_uuid(), recruiter_client_id uuid not null references globalhire.recruiter_clients(id) on delete cascade, recruiter_id uuid not null, doc_type text not null, file_name text, file_path text not null, mime_type text, file_size_bytes bigint, status text not null default 'pending', created_at timestamptz default now());`.
- [ ] **Step 3: Create `public.gh_recruiter_clients` and `public.gh_recruiter_client_documents` views** (`SELECT * FROM globalhire.<t>`), `GRANT SELECT, INSERT, UPDATE ON ... TO authenticated;` and matching grants on base tables, following the `gh_profiles` view definition as template.
- [ ] **Step 4: RLS.** Enable RLS on both base tables. Policies: recruiter INSERT/SELECT/UPDATE where `recruiter_id = auth.uid()`; admin ALL via `globalhire.is_admin()`. Recruiters may NOT write `admin_status`/`admin_note`/`reviewed_*` — enforce via a `BEFORE UPDATE` trigger that rejects recruiter changes to those columns (or a column-level grant). Admin-only columns updatable only when `globalhire.is_admin()`.
- [ ] **Step 5: Apply** via Supabase MCP `apply_migration(project_id='evzhnsugmvtqgmvzwyix', name='v18_recruiter_clients', query=<sql>)`.
- [ ] **Step 6: Verify** with `execute_sql`: `select count(*) from globalhire.recruiter_clients;` (0), and `select * from public.gh_recruiter_clients limit 1;` (no error). Confirm RLS: `get_advisors(type='security')` shows no new RLS-disabled warnings.
- [ ] **Step 7: Commit** `git add schema-v18-recruiter-clients.sql && git commit -m "feat(db): recruiter_clients → globalhire schema + review columns + docs table + RLS"`.

---

### Task 2: Recruiter portal — "My Candidates" tab shell + list load

**Files:**
- Modify: `recruiter.html` (add sidebar nav item + `rec-tab` panel, mirror existing `tab-candidates` structure at lines 476/538)
- Modify: `js/recruiter.js` (add tab to `pageTitles` map ~line 140; add `loadMyCandidates()`)

**Interfaces:**
- Consumes: `window.ghSupabase`, `ghFrom('recruiter_clients')`, `currentUser` (set in existing init).
- Produces: `loadMyCandidates()` renders into `#my-candidates-grid`; called from tab switch + init.

- [ ] **Step 1:** Add sidebar item `<a class="sb-nav-item" data-tab="tab-mycandidates">My Candidates</a>` and a `<div class="rec-tab" id="tab-mycandidates">` with a toolbar (title "My Candidates", "+ Add Candidate" button `#btn-add-candidate`), a `#my-candidates-grid`, and count `#my-candidates-count`. Copy markup/classes from the existing `#tab-candidates` block.
- [ ] **Step 2:** In `js/recruiter.js`, add `'tab-mycandidates': 'My Candidates'` to `pageTitles`.
- [ ] **Step 3:** Implement `async function loadMyCandidates()`: `var r = await ghFrom('recruiter_clients').select('*').eq('recruiter_id', currentUser.id).order('created_at', {ascending:false});` render each as a card showing name, profession/specialty, `admin_status` badge, and `admin_note` if present (this is the feedback loop display). Empty state: "You haven't added any candidates yet."
- [ ] **Step 4:** Wire tab switch to call `loadMyCandidates()` the first time `tab-mycandidates` is shown; call once on init if that tab is default-visible.
- [ ] **Step 5: Verify (manual/Playwright):** log in as an approved recruiter, click "My Candidates" → empty state renders, no console errors. Add a Playwright smoke in `tests/` that loads the portal and asserts the tab is present.
- [ ] **Step 6: Commit** `git add recruiter.html js/recruiter.js && git commit -m "feat(recruiter): My Candidates tab + list"`.

---

### Task 3: Recruiter portal — Add Candidate form (details) + submit

**Files:**
- Modify: `recruiter.html` (a modal/panel form `#add-candidate-panel`)
- Modify: `js/recruiter.js` (`openAddCandidate()`, `submitCandidate()`)

**Interfaces:**
- Consumes: `ghFrom('recruiter_clients')`, `currentUser`.
- Produces: inserts a `recruiter_clients` row; returns new `id` used by Task 4 (document upload).

- [ ] **Step 1:** Add form fields: full_name*, email, phone, profession* (select: Doctor/Nurse/Other), specialty, experience_years, current_country, target_countries (multi), passport_number, license_number, notes (→ `profile_data.notes`). Mirror form styling from the offer page apply form.
- [ ] **Step 2:** `submitCandidate()` validates required fields, then `var {data, error} = await ghFrom('recruiter_clients').insert({recruiter_id: currentUser.id, full_name, email, phone, profession, specialty, experience_years: parseInt(...)||null, current_country, target_countries, passport_number, license_number, profile_data: {notes}, status:'new', admin_status:'submitted'}).select().single();` Keep `data.id` for the doc-upload step.
- [ ] **Step 3:** On success, open the document-upload step (Task 4) for `data.id`; on failure show an inline error.
- [ ] **Step 4: Verify:** add a candidate → row appears in `globalhire.recruiter_clients` (check via `execute_sql`), card shows in the list with "Submitted" badge.
- [ ] **Step 5: Commit** `git add recruiter.html js/recruiter.js && git commit -m "feat(recruiter): add-candidate form + insert"`.

---

### Task 4: Recruiter portal — document upload per candidate

**Files:**
- Modify: `js/recruiter.js` (`uploadCandidateDoc()`, reuse offer-page drag/drop pattern)

**Interfaces:**
- Consumes: `window.ghSupabase.storage`, `ghFrom('recruiter_client_documents')`, the `recruiter_clients.id` from Task 3.
- Produces: files in `gh-applicant-documents` + rows in `recruiter_client_documents`.

- [ ] **Step 1:** Doc fields: CV, Medical Licence, DataFlow Report, Passport, Fellowship (all optional at submit; recruiter can add later). Reuse the file-drop UI/logic from `riyadh-specialist-doctors.html` (selectedFiles map, drag/drop, browse).
- [ ] **Step 2:** For each file: `path = 'recruiter-clients/'+currentUser.id+'/'+clientId+'/'+docType+'-'+Date.now()+'.'+ext;` `await ghSupabase.storage.from('gh-applicant-documents').upload(path, file, {contentType:file.type});` then `await ghFrom('recruiter_client_documents').insert({recruiter_client_id:clientId, recruiter_id:currentUser.id, doc_type:docType, file_name:file.name, file_path:path, mime_type:file.type, file_size_bytes:file.size, status:'pending'});`
- [ ] **Step 3:** Show uploaded docs on the candidate card; allow adding more later from the card.
- [ ] **Step 4: Verify:** upload a CV → object exists in bucket, row in `recruiter_client_documents`.
- [ ] **Step 5: Commit** `git add js/recruiter.js && git commit -m "feat(recruiter): candidate document uploads"`.

---

### Task 5: Admin — Recruiter Submissions view (list, tagged by recruiter)

**Files:**
- Modify: `candidates.html` (add a "Recruiter Submissions" tab/section) + `js/candidates.js` (loader). If `candidates.html` is already crowded, create `recruiter-submissions.html` + `js/recruiter-submissions.js` and link it from admin nav.

**Interfaces:**
- Consumes: `ghFrom('recruiter_clients')` (admin RLS returns all), `ghFrom('profiles')` for recruiter names.
- Produces: `loadSubmissions()` rendering a table with filters (recruiter, admin_status).

- [ ] **Step 1:** Load all submissions joined to recruiter name: `select *` from `gh_recruiter_clients`, and a map of recruiter_id→full_name from `gh_profiles` where role='recruiter'. Render rows: candidate, profession/specialty, **source recruiter**, admin_status badge, created_at, "Review" action.
- [ ] **Step 2:** Filters: by recruiter (dropdown of recruiters) and by admin_status.
- [ ] **Step 3: Verify:** the candidate added in Task 3 appears here tagged with the recruiter's name.
- [ ] **Step 4: Commit** `git add candidates.html js/candidates.js && git commit -m "feat(admin): recruiter submissions list"`.

---

### Task 6: Admin — review a submission (docs, set status + note)

**Files:**
- Modify: same admin file(s) as Task 5 (detail panel + `updateSubmission()`)

**Interfaces:**
- Consumes: `ghFrom('recruiter_clients')`, `ghFrom('recruiter_client_documents')`, storage signed URLs.
- Produces: updates `admin_status`, `admin_note`, `reviewed_by`, `reviewed_at`. Emits status-change → Task 7 notify.

- [ ] **Step 1:** Detail panel: candidate fields + document list with signed-download links (`storage.from('gh-applicant-documents').createSignedUrl(path, 3600)`).
- [ ] **Step 2:** Status dropdown (submitted/under_review/shortlisted/placed/rejected) + note textarea + Save.
- [ ] **Step 3:** `updateSubmission(id, status, note)` → `ghFrom('recruiter_clients').update({admin_status:status, admin_note:note, reviewed_by:currentUser.id, reviewed_at:new Date().toISOString()}).eq('id', id);` then invoke Task 7 notify.
- [ ] **Step 4: Verify:** set a candidate to "shortlisted" + note; recruiter portal (Task 2 list) shows the new badge + note.
- [ ] **Step 5: Commit** `git add candidates.html js/candidates.js && git commit -m "feat(admin): review submission — status + note + docs"`.

---

### Task 7: Email notification to recruiter on status change

**Files:**
- Create: `supabase/functions/notify-recruiter-status/index.ts` (Deno edge function)
- Modify: admin `updateSubmission()` to invoke it

**Interfaces:**
- Consumes: `{ recruiter_email, recruiter_name, candidate_name, admin_status, admin_note }`.
- Produces: sends an email via the project's existing mailer (reuse the `welcome-applicant` function's transport/config).

- [ ] **Step 1:** Copy transport/config from an existing GlobalHire edge function (`supabase/functions/`), send a plain templated email: subject "Update on your candidate {candidate_name}", body with new status + admin note + portal link.
- [ ] **Step 2:** Deploy: `supabase functions deploy notify-recruiter-status` (or MCP `deploy_edge_function`).
- [ ] **Step 3:** In `updateSubmission()`, after the DB update: `ghSupabase.functions.invoke('notify-recruiter-status', {body:{...}}).catch(...)` (non-blocking).
- [ ] **Step 4: Verify:** change a status → recruiter receives the email; in-portal badge already updates (Task 2). Both channels covered.
- [ ] **Step 5: Commit** `git add supabase/functions/notify-recruiter-status candidates.html js/candidates.js && git commit -m "feat(recruiter): email notify on status change"`.

---

### Task 8: (Optional) Promote a submission into the main candidate pool

**Files:** Modify admin file(s) (`promoteSubmission()`)

- [ ] **Step 1:** "Promote to candidate pool" action: create a `globalhire.profiles` row (role 'applicant', source 'recruiter:{recruiter_id}'), copy docs to the candidate's document set, set `recruiter_clients.promoted_profile_id`. 
- [ ] **Step 2: Verify:** promoted candidate appears in the main `candidates.html` list with source tag.
- [ ] **Step 3: Commit.**

---

## Self-Review
- **Spec coverage:** recruiter upload (T2–T4), documents (T4), admin visibility tagged by recruiter (T5), act/status (T6), respond to recruiter (T6 note + T7 email + T2 in-portal) — all covered. Campaign exclusion is Plan 2 (out of scope here).
- **Schema decision resolved:** T1 moves `recruiter_clients` into `globalhire` + `gh_` view so `ghFrom()` works and RLS matches convention.
- **Open decision for executor:** whether admin UI extends `candidates.html` or a new `recruiter-submissions.html` (T5 step notes the fork; pick based on file size at execution).
- **RLS gate:** T1 step 6 + a pre-go-live RLS review (recruiters must never see others' rows or write admin columns).
