# GlobalHire Partner Marketplace — Design Spec

Date: 2026-09-03
Status: Draft for CEO review (approved through brainstorming; not yet planned)
Repo: `GLOBALHIRE@ELAB` · GlobalHire Supabase `evzhnsugmvtqgmvzwyix` (`globalhire` schema + `gh_*` public views)
Supersedes the recruiter portions of: `docs/recruiter-portal-architecture-design.md` (2026-07-02)
Related: `docs/superpowers/plans/2026-07-06-gh-rls-remediation.md`, `docs/superpowers/plans/2026-07-02-recruiter-candidate-submission.md`

---

## 1. Purpose

Turn GlobalHire's thin recruiter portal (*eLab sources a candidate → assigns to a recruiter → recruiter
assesses*) into an **AI-first, open, two-sided medical-recruitment marketplace with an agency-partner
layer** — the category Al Fadhel Jobs (`alfadheljobs.com`) occupies, but with the differentiation coming
from AI: explainable matching, document parsing, screening, and drafted comms.

**Phase 1 is jobs-first and one-directional:** GlobalHire (and its client employers) post vacancies;
verified partner agencies add their own candidates and **nominate** them against those jobs. Agencies
posting *their own* jobs, a shared talent directory, subscription tiers, and a payments processor are all
later phases.

### What Al Fadhel has that we are replicating (with AI on top)

| Al Fadhel piece | Our equivalent |
|---|---|
| Site jobs (employers post, agencies compete) | `mp_jobs` — GH/employer-posted vacancies |
| Candidate nominations + lifecycle | `mp_nominations` + `mp_nomination_events` |
| Candidate ownership: `blocked_existing_candidate`, `blocked_partner_claim`, ~1-yr claim expiry | `mp_claims` — 6-month exclusive claim, opens on nomination, deterministic fuzzy dedupe |
| Claim → Commission → Settlement, Invoices, Contracts | `mp_placements` + `mp_statements` + `mp_statement_payments` (ledger only, paid off-platform) |
| Partnership profile: services + "cooperation areas" + licence upload | `mp_agencies` (`services[]`, `cooperation_areas[]`, licence/profile files, verification) |
| TSN (Radar → Signals → Matches → Top 10/3 → Decision → Shortlist → Offer → Interview → Placement) | `mp-match` engine + `mp_match_scores` + `mp_job_fit_alerts`; screening; the admin pipeline cockpit |
| Orders ("Request candidate", "Request interview") | Not in Phase 1 — the nomination + admin queue covers it |
| Browse Profiles (open directory) | **Deliberately excluded** — candidates stay private to their agency |
| Inbox / Channels | `mp_threads` + `mp_messages` |
| Team, Plans/Usage/Billing tiers | `mp_agency_members` (Phase 1); subscription tiers = Phase 3 |

## 2. Locked decisions (CEO, 2026-09-03)

1. **Open marketplace** — agencies self-register, GlobalHire admin verifies.
2. **Jobs-first** — GH + client employers post vacancies; partner agencies nominate candidates. Primary
   paying user = partner agencies with candidates. Agencies posting their own jobs = Phase 3.
3. **Built on the current stack** — static multi-page HTML in `GLOBALHIRE@ELAB`, `window.ghSupabase` /
   `ghFrom`, Supabase Postgres + RLS + Deno edge functions, `vercel --prod` on push. No new framework, no
   second database.
4. **Money = ledger only** — fee split recorded on-platform; a claim + statement is generated when a
   candidate is hired; actual payment happens by bank transfer off-platform. No processor in Phase 1/2.
5. **AI (all four) in Phase 1** — explainable candidate↔job matching · CV/document parsing → structured
   profiles · AI screening interview + report · AI-drafted comms. Plus deterministic fuzzy
   duplicate/ownership detection as infrastructure.
6. **Ownership** — a partner's candidates are visible only to that partner + GH admin (no shared
   directory). A 6-month exclusive **claim opens on nomination**; the dedupe check runs at nomination.
7. **Phase 1 scope = the full loop** — S1–S10 below (everything except subscription tiers and two-sided
   jobs). AI screening is text-chat; voice is a later flag.
8. **Security remediation is in-scope** — the 2026-07-06 `gh_*`/RLS hole is closed as build chunk 1.

### Deferred to later phases (explicitly out of Phase 1)

- Subscription tiers / credits / usage metering (Phase 3)
- Agencies posting their own vacancies — two-sided jobs (Phase 3)
- Shared/open talent directory + "Browse Profiles" + Radar-style standing monitors (Phase 3)
- In-platform payments processor, payouts, escrow, KYC (not planned)
- Voice screening (flagged, later)
- Candidate-facing offer-response token pages (later; admin records the response in Phase 1)
- Migrating the legacy "eLab assigns a candidate to a recruiter" flow onto the new model (later; the old
  tables stay live in parallel)

## 3. Subsystems

| # | Subsystem | Phase |
|---|---|---|
| S1 | Agency identity: signup, partnership profile, admin verification queue, team seats, **multi-tenant RLS** | 1 |
| S2 | Shared job board — GH-posted vacancies, structured criteria, partner listing + detail + Nominate | 1 |
| S3 | Candidate records (private) + document upload + **AI doc-parsing → structured profile** + mismatch flags | 1 |
| S4 | Nomination + **fuzzy dedupe** + **claim ledger** + nomination lifecycle + status feedback | 1 |
| S5 | **AI matching engine** — score + rationale + gap/risk flags; "you have N fits" on new jobs | 1 |
| S6 | **AI screening interview** + scored report on the nomination | 1 |
| S7 | **AI-drafted comms** — cover notes, status messages, employer summaries, rejection notes | 1 |
| S8 | Interviews / offers / placements pipeline | 1 |
| S9 | Commission ledger — claim → fee-split → statement → mark-paid | 1 |
| S10 | Per-nomination thread + email/in-portal notifications + daily digest | 1 |
| S11 | Subscription tiers / credits / usage · agencies post their own jobs · open directory / radar | 3 |

---

## 4. Architecture & multi-tenancy foundation (S1)

### 4.1 Stack

Unchanged from the rest of the site. New partner UI is a `partners-*.html` page group; admin UI extends
the existing `recruiters.html` / `recruiter-submissions.html` family. Edge functions are Deno, deployed
via the Supabase CLI. Client reads/writes through `security_invoker` `gh_mp_*` views in the public schema.

### 4.2 The tenancy change

Today a "recruiter" is one `auth.users` row with `gh_profiles.role='recruiter'`. The marketplace needs an
**agency** that users belong to:

- **`mp_agencies`** — the tenant. `id`, `name`, `country`, `city`, `address`, `website`, `year_founded`,
  `owner_name`, `services[]`, `cooperation_areas[]`, `licence_file_path`, `company_profile_path`,
  `status` (`pending_verification | verified | suspended | rejected`), `verification_note`, `verified_by`,
  `verified_at`, `created_at`.
  - `services[]` taxonomy (from Al Fadhel's form): flight-ticket booking, candidate sourcing, local
    recruitment, medical verification & licensing, international recruitment, visa clearance, providing
    job opportunities.
  - `cooperation_areas[]` taxonomy: *I have jobs and want candidates · I have medical cadres to nominate ·
    DataFlow/licensing partnership · be your agent/representative · international recruitment partnership ·
    urgent recruitment · Gulf-market partnership · permanent · temporary · new-market entry · visa
    clearance · flight booking for my clients*.
- **`mp_agency_members`** — `(agency_id, user_id, role: owner|admin|member, status: active|invited|removed,
  invited_by, created_at)`. **Source of truth for "which agency is this user acting for."** First signup
  creates the agency + an `owner` membership.
- **`mp_agency_invites`** — `(agency_id, email, role, token, invited_by, expires_at, accepted_at)`.

**RLS pattern (every marketplace table):**

```sql
-- agency users
USING (
  agency_id IN (
    SELECT agency_id FROM globalhire.mp_agency_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
)
-- GlobalHire staff bypass
OR globalhire.is_admin()
```

No cross-agency read, ever. `mp_agencies` itself: a member sees only their own agency; admin sees all.

**Migration:** for each existing approved recruiter (`gh_profiles.role='recruiter'` AND
`recruiter_approved`), create one `mp_agencies` row (`status='verified'`) + an `owner`
`mp_agency_members` row. Nothing in the legacy flow breaks.

### 4.3 Verification flow

`partners-signup.html` → `mp-agency-register` edge fn creates the agency (`pending_verification`) + owner
membership, stores licence/profile uploads → admin queue (new **Agencies** tab in `recruiters.html`) →
admin `verify` / `reject` / `suspend` with a note → `mp-agency-verify` emails the agency. Only `verified`
agencies can see jobs or nominate — enforced **server-side** (RLS + edge-fn guard), not just UI.

### 4.4 Security remediation (build chunk 1, non-negotiable)

Pre-existing, documented in `docs/superpowers/plans/2026-07-06-gh-rls-remediation.md`:

- `public.gh_profiles` + ~34 sibling `gh_*` views are `postgres`-owned, **not** `security_invoker`, and
  grant INSERT/UPDATE/DELETE to `anon` **and** `authenticated` → anyone with the public anon key can
  write any profile field (role escalation, `recruiter_approved`, etc.).
- RLS is **disabled** on `globalhire.recruiter_assignments` + 4 other tables.

A marketplace where Agency A must never see Agency B's data cannot ship on top of this. Chunk 1:

1. Convert the `gh_*` views that are written by the app to `security_invoker` (or route writes through
   service-role edge fns), add proper `globalhire.profiles` admin-UPDATE / self-UPDATE policies.
   - **Coupling:** the `allow_direct_marketing` admin toggle (2026-07-02 Feature B) currently works only
     *because* of the bypass — it must get a real admin-UPDATE policy or a service-role route in the same
     change, or it breaks.
2. Enable RLS + write policies on `recruiter_assignments` and the other four tables.
3. All new `gh_mp_*` views are `security_invoker` from creation; `anon` is granted nothing on them.

Regression risk is real (many pages write via `gh_profiles`) — this chunk gets its own test pass
(§10.3) before anything else builds on it.

---

## 5. Data model (S1–S10)

All tables: `mp_` prefix, `globalhire` schema, exposed as `security_invoker` `gh_mp_*` views, `agency_id`
on every row, RLS per §4.2. JSONB for AI outputs and flexible criteria; anything queried or filtered is a
real column. All `id` = `uuid default gen_random_uuid()`; all tables have `created_at timestamptz default
now()`.

### 5.1 Tenancy
- `mp_agencies`, `mp_agency_members`, `mp_agency_invites` — see §4.2.

### 5.2 Job board (S2)
- **`mp_jobs`** — `title`, `employer_name`, `employer_confidential bool default false`,
  `destination_country`, `city`, `specialty`, `subspecialty`, `seniority_level`, `contract_type`
  (`permanent | locum | temporary`), `facility_type`, `positions_count int default 1`, `salary_min`,
  `salary_max`, `salary_currency`, `salary_display text`, `benefits[]`, `jd_text`,
  `status` (`draft | open | paused | filled | closed`), `placement_fee_amount numeric`,
  `placement_fee_currency`, `partner_split_pct numeric default 50`, `source` (`internal | employer |
  imported`), `origin_campaign_id uuid null`, `posted_by uuid`, `published_at`, `closes_at`.
  Requirement columns: `min_experience_years int`, `required_licences[]`, `required_exams[]`,
  `nationality_prefs[]`, `gender_pref`, `age_min int`, `age_max int`, `language_reqs[]`,
  `extra_criteria jsonb`.

### 5.3 Candidates (S3)
- **`mp_candidates`** — owner = agency. `full_name`, `name_variants[]`, `email`, `phone`, `whatsapp`,
  `nationality`, `current_country`, `current_city`, `gender`, `dob date`, `profession`, `specialty`,
  `subspecialty`, `seniority_level`, `years_experience numeric`, `current_employer`, `current_title`,
  `licences jsonb` (`[{authority, number, type, status, issued, expiry}]`),
  `exams jsonb` (`[{exam, status, date, score}]`), `languages[]`,
  `readiness` (`available_now | 1_month | 3_months | <date>`), `salary_expectation`,
  `preferred_destinations[]`, `willing_to_relocate bool`, `notes`,
  `source` (`manual | ai_parsed | promoted`), `ai_parsed bool default false`,
  `ai_parse_confidence numeric`, `ai_flags[]`, **`identity_hash text`** (normalised name +
  passport last-4 + primary licence #), `passport_last4 text`, `passport_number text` (column-restricted
  — see §9), `created_by uuid`.
- **`mp_candidate_documents`** — `candidate_id`, `agency_id`, `doc_type` (`cv | passport | licence |
  dataflow | fellowship | degree | experience_letter | photo | other`), `file_path`, `file_name`,
  `mime_type`, `file_size_bytes`, `ai_extracted jsonb`, `status` (`uploaded | parsed | verified |
  rejected`), `uploaded_by`.
  - Storage: existing `gh-applicant-documents` bucket, path
    `marketplace/agency/{agency_id}/candidate/{candidate_id}/{doc_type}-{uuid}.{ext}`, + a new
    agency-scoped storage RLS policy.

### 5.4 Nomination + ownership (S4)
- **`mp_claims`** — the ownership ledger. `agency_id`, `candidate_identity_hash text`, `candidate_id`,
  `first_nominated_job_id`, `opened_at`, `expires_at` (`opened_at + interval '6 months'`),
  `status` (`active | expired | released | superseded`), `released_reason`, `released_by`.
  - **Partial unique index:** `CREATE UNIQUE INDEX ON mp_claims (candidate_identity_hash) WHERE status =
    'active';` → at most one live claim per human.
- **`mp_nominations`** — `job_id`, `candidate_id`, `agency_id`, `claim_id`,
  `status` (`draft → submitted → gh_review → shortlisted → employer_submitted → interview → offer →
  hired`, terminal `rejected | withdrawn | expired`), `ai_match_score numeric`,
  `ai_match_rationale jsonb`, `screening_id uuid null`, `cover_note text`,
  `rejection_reason`, `withdrawn_reason`, `status_changed_at`, `status_changed_by`.
- **`mp_nomination_events`** — `nomination_id`, `from_status`, `to_status`, `actor uuid`,
  `actor_side` (`agency | gh | system`), `note`, `created_at`.
- **`mp_dedupe_checks`** — `candidate_id`, `job_id`, `agency_id`, `run_at`,
  `matches jsonb` (`[{candidate_id, agency_id, score, reasons[], claim_status}]`),
  `decision` (`clear | blocked | admin_override`), `reviewed_by`.

### 5.5 AI matching (S5)
- **`mp_match_scores`** — cache. `job_id`, `candidate_id`, `agency_id`, `score numeric`,
  `band` (`strong | possible | weak`), `rationale jsonb` (`{fits[], gaps[], risks[]}`), `model`,
  `computed_at`, `stale bool default false`. PK `(job_id, candidate_id)`.
- **`mp_job_fit_alerts`** — `agency_id`, `job_id`, `candidate_ids[]`, `top_score numeric`,
  `notified_at`, `dismissed bool default false`.

### 5.6 AI screening (S6)
- **`mp_screening_templates`** — `name`, `specialty`, `seniority`,
  `questions jsonb` (`[{q, type, rubric}]`), `is_default bool`, `created_by`.
- **`mp_screenings`** — `candidate_id`, `nomination_id uuid null`, `job_id uuid null`, `agency_id`,
  `template_id`, `mode` (`chat | voice`, Phase 1 = `chat`), `token text unique`,
  `status` (`sent | started | completed | expired`), `expires_at`, `questions jsonb`,
  `transcript jsonb`, `scores jsonb`, `verdict` (`recommend | borderline | reject`), `ai_report_md text`,
  `started_at`, `completed_at`.

### 5.7 AI comms (S7)
- **`mp_ai_drafts`** (optional cache/audit) — `context_type`, `context_id`, `draft_md`, `model`,
  `used bool`, `created_by`. Final sent text lives in `mp_messages`.

### 5.8 Pipeline (S8)
- **`mp_interviews`** — `nomination_id`, `job_id`, `candidate_id`, `agency_id`, `scheduled_at`,
  `mode` (`onsite | video | phone`), `location_or_link`, `panel[]`,
  `status` (`proposed | confirmed | completed | cancelled | no_show`), `outcome`, `feedback_md`,
  `created_by`.
- **`mp_offers`** — `nomination_id`, `candidate_id`, `agency_id`, `job_id`, `salary`, `currency`,
  `start_date date`, `contract_type`, `terms_md`,
  `status` (`drafted | extended | accepted | declined | withdrawn`), `extended_at`, `responded_at`,
  `response_note`.
- **`mp_placements`** — `nomination_id`, `candidate_id`, `agency_id`, `job_id`, `offer_id`,
  `start_date date`, `placement_fee_amount numeric`, `placement_fee_currency`,
  `partner_split_pct numeric`, `guarantee_period_days int`,
  `status` (`pending_start | started | guarantee | completed | fallout`), `fallout_reason`, `claim_id`.

### 5.9 Commission ledger (S9)
- **`mp_statements`** — `agency_id`, `placement_id`, `period text`, `gross_fee numeric`,
  `partner_split_pct numeric`, `partner_amount numeric`, `currency`,
  `status` (`draft | issued | partly_paid | paid | void`), `issued_at`, `void_reason`, `notes`.
- **`mp_statement_payments`** — `statement_id`, `amount numeric`, `currency`, `paid_on date`,
  `method`, `reference`, `recorded_by`.

### 5.10 Messaging & notifications (S10)
- **`mp_threads`** — `agency_id`, `subject`, `context_type` (`nomination | job | agency | general`),
  `context_id uuid null`, `last_message_at`, `gh_unread int default 0`, `agency_unread int default 0`.
- **`mp_messages`** — `thread_id`, `sender_user_id`, `sender_side` (`agency | gh`), `body_md`,
  `ai_assisted bool default false`, `attachments jsonb`, `created_at`.
- **`mp_notifications`** — `user_id`, `agency_id`, `type`, `title`, `body`, `link`,
  `read_at timestamptz null`, `email_sent bool default false`, `created_at`.

### 5.11 AI infra (cross-cutting)
- **`mp_ai_runs`** — `feature` (`parse | match | screen | draft | dedupe_tiebreak`), `context_id`,
  `model`, `prompt_tokens int`, `completion_tokens int`, `cost_usd numeric`, `latency_ms int`,
  `status` (`ok | error`), `error text`, `created_at`. Mirrors CC's `ai_usage_log`.

---

## 6. The core loop (S2 / S3 / S4)

### 6.1 Job board (S2)

**Admin** — `admin-mp-jobs.html`: structured-criteria create/edit form modelled on Al Fadhel's radar
builder (specialty, seniority, licence required, country/city, contract type, facility type, experience
band, nationality/gender/age/language prefs), fee + `partner_split_pct`, `employer_confidential` toggle,
publish / pause / close. "Create from campaign" seeds an `mp_job` from a `gh_campaign` (sets
`origin_campaign_id`).

**Partner** — `partners-jobs.html`: `open` jobs, filters (specialty, country, city, seniority, licence,
contract type). Each card shows a **"N of your candidates match"** badge from `mp_match_scores`.
`partners-job.html?id=` — full requirements, fee/split visible, employer hidden if
`employer_confidential`, **Nominate** opens a picker of the agency's candidates ranked by match score.

### 6.2 Candidate intake + AI parsing (S3)

`partners-candidates.html` (private list) → **Add candidate**:

1. **Upload-first (default):** drop CV + passport + licence + DataFlow PDFs → `mp-parse-documents` →
   returns a structured **draft the partner reviews and corrects** before save. Sets `ai_parsed=true`,
   `ai_parse_confidence`, `ai_flags[]`, computes `identity_hash`. Never silently commits identity/contact
   fields; sub-threshold fields flagged for review.
2. **Manual:** plain form.

`partners-candidate.html?id=` — profile, documents, parse status + flags, match history, nomination
history.

### 6.3 Nomination + dedupe + claims (S4)

Partner picks candidate + job → **`mp-nominate`**:

1. **Gate** — candidate must have `passport_last4` **or** a licence number, else `422` ("add passport or
   licence number first").
2. **Dedupe** — deterministic (see §7.6): exact on passport last-4 / licence # / phone, trigram +
   Levenshtein on `full_name` + `name_variants`. Then check `mp_claims` for an `active` claim on the hash.
   - Active claim, **another agency** → **blocked**, no nomination created:
     `{ blocked: true, reason: 'claimed', until: expires_at }`. UI: *"claimed by another partner until
     `<date>`"*.
   - Strong match to another agency, claim **expired** → allowed; `mp_dedupe_checks.decision='clear'` +
     `review_flag` for GH admin.
   - Match **within own agency** → offer to merge records (never hard-block).
   - Clear → proceed.
3. **Claim** — no active claim → `INSERT mp_claims` (`active`, `expires_at = now() + 6mo`); own agency
   already holds it → reuse `claim_id`.
4. **Match** — call `mp-match` if the cache row is missing/`stale`.
5. Create `mp_nomination` (`submitted`), attach `claim_id` + score/rationale, write a
   `mp_nomination_events` row, open an `mp_threads` row (context = nomination). Optionally fire the AI
   cover-note draft and AI screening invite (partner's choice).

**Claim lifecycle** — daily cron `mp-claims-expiry`:

- `active → expired` once past `expires_at`, **unless** a nomination on that claim is live
  (`shortlisted | employer_submitted | interview | offer`) — those hold the claim open until the
  nomination closes.
- `hired` → claim locked to the placement.
- `rejected | withdrawn` → claim stays `active` until `expires_at` (protects the sourcing agency); the
  owner gets an early **Release** button.
- GH admin can `release` / reassign a claim with a logged reason
  (`mp_dedupe_checks.decision='admin_override'` + `mp_claims.released_reason`).

**Admin review** — `admin-mp-nominations.html`: queue of `submitted` nominations grouped by job, each row
showing candidate profile + AI match rationale + AI screening verdict + docs (signed URLs) + dedupe
result. Actions: advance status, reject with reason, request info (posts to the thread), submit to
employer.

---

## 7. The AI layer (S3 / S5 / S6 / S7)

### 7.1 Shared infrastructure

Every AI call goes through **`supabase/functions/_shared/mp-ai.ts`**, wrapping the Anthropic call the repo
already uses (`ANTHROPIC_API_KEY`, `claude-sonnet-4`; existing `analyze-document`, `draft-message`). It
owns:

- per-feature model routing (parsing/match/screen → sonnet; drafting → haiku, sonnet fallback);
- retry/fallback chain, strict JSON-mode enforcement (reject + one retry on parse failure);
- output-token caps, PII minimisation (only required fields sent);
- kill-switch env `MP_AI_ENABLED` (false → every AI feature degrades per §10.1);
- cost + latency logging to `mp_ai_runs`.

Prompts are versioned constants under `_shared/mp-prompts/`. One shim ⇒ a later swap to the ELAB
multi-model gateway (Qwen3-Max / DeepSeek — see the "ELAB Multi-Model AI Architecture" brief) is a
single-file change. Estimated Phase 1 spend at expected volume (tens of agencies, hundreds of
candidates): **under ~$50/mo**.

### 7.2 `mp-parse-documents` (S3)

Input: `candidate_id` + document ids. One Claude-vision call per document with a doc-type-specific JSON
schema (CV → work history / education / skills; passport → name / number / nationality / DOB / expiry;
licence → authority / number / type / issued / expiry / status; DataFlow → status / reference / date). A
merge step reconciles fields across documents, emits `ai_flags[]` on conflicts (name spelling differs,
experience vs licence-issue date, passport expiring), scores per-field confidence, writes `ai_extracted`
per document, merges into `mp_candidates` **without overwriting a partner-edited field**, computes
`identity_hash`. Returns the draft. ~$0.03–0.08 / candidate.

### 7.3 `mp-match` (S5)

Deterministic pre-filter first — hard misses (wrong profession, excluded nationality, required licence
category absent) cap the score and short-circuit. Otherwise Claude compares structured job requirements
vs candidate facts → `score` 0–100, `band`, `fits[]`, `gaps[]` (each with rough time-to-close, e.g.
*"SCFHS not started — 8–12 wk"*), `risks[]` (passport/licence expiry, over/under-qualified, salary gap).
Cached in `mp_match_scores`; `stale=true` on job/candidate edit; nightly `mp-match-batch` recompute for
stale rows. On job publish, matches run across every verified agency's same-specialty candidates →
`mp_job_fit_alerts` for `strong`/`possible` bands. ~$0.01–0.02 / pair, batched.

### 7.4 `mp-screen-*` (S6)

- `mp-screen-start` — creates `mp_screenings`, picks a template by specialty/seniority (default
  fallback), generates a token, emails/WhatsApps the candidate a link to `screen.html?token=`.
- `screen.html` — public, token-gated (`verify_jwt=false`, expiring, rate-limited, like `opportunity.html`
  / `gh-respond-token`). Text chat, 5–8 questions (role scenario, availability, salary expectation,
  relocation readiness, language, licence/exam status). Turn-by-turn via `mp-screen-turn` — Claude stays
  on-script, limited follow-up probes, hard stop at N turns / timeout.
- `mp-screen-score` — on completion, grades each answer against the template rubric → `scores` jsonb +
  `verdict` (`recommend | borderline | reject`) + `ai_report_md`, attaches to the nomination.
- **Advisory only** — never auto-rejects; candidate may decline; partner may nominate without it.
- Voice mode = later flag (`mode='voice'` column reserved).

### 7.5 `mp-draft` (S7)

One edge fn, `context_type ∈ { nomination_cover, employer_summary, status_update, rejection_note,
partner_outreach, thread_reply }`. Pulls the relevant records, drafts in GlobalHire's voice (haiku, sonnet
fallback), returns markdown. **Never auto-sends** — a human edits and clicks send; the sent copy lands in
`mp_messages` with `ai_assisted=true`. Optional `mp_ai_drafts` cache.

### 7.6 Dedupe (not an LLM) — `_shared/mp-identity.ts`

- `identity_hash` = `normalise(full_name) + '|' + passport_last4 + '|' + normalise(primary_licence_no)`
  (missing parts blank). `normalise` = lowercase, strip diacritics/punctuation, collapse whitespace,
  sort name tokens.
- Fuzzy match: exact on passport last-4 / licence # / phone → score 1.0; trigram similarity + normalised
  Levenshtein on name & `name_variants` → 0–1.
- LLM tie-breaker (`mp-ai`, `feature='dedupe_tiebreak'`) runs **only** on ambiguous name-only near-matches
  (0.72–0.90 name similarity, no hard identifier match).

---

## 8. Downstream: pipeline, ledger, messaging (S8 / S9 / S10)

### 8.1 Interviews / offers / placements (S8)

From `employer_submitted` onward, **GH admin drives** via `admin-mp-nomination.html` (single-nomination
cockpit: full event timeline + interview/offer/placement actions). Partner gets a read-only status view +
the message thread.

- **`mp_interviews`** — admin proposes slot(s) → partner + candidate notified → confirm → admin logs
  outcome + `feedback_md`.
- **`mp_offers`** — admin drafts (salary, start date, contract type, `terms_md`) → `extended` → response
  recorded `accepted | declined` (candidate token-page later).
- **`mp_placements`** — on offer `accepted`, admin creates the placement (`start_date`;
  `placement_fee_amount` + `partner_split_pct` copied from the job; `guarantee_period_days`). Nomination
  → `hired`, claim locked to the placement. Status `pending_start → started → guarantee → completed`, or
  `fallout` if the candidate leaves within guarantee.

### 8.2 Commission ledger (S9)

On placement **`started`**, admin generates an `mp_statement`: `gross_fee = placement_fee_amount`,
`partner_amount = gross_fee × partner_split_pct`, status `draft → issued`. Partner sees it on
`partners-billing.html` (amount owed, status, payment history); admin reconciles on
`admin-mp-statements.html` via **Record payment** (`mp_statement_payments`) → status auto-moves
`partly_paid | paid`. A `fallout` in guarantee lets admin `void` the statement or post a negative
adjustment payment — the ledger keeps the full audit. No processor.

### 8.3 Messaging & notifications (S10)

- **Threads/messages** — a thread auto-opens per nomination on submit (plus job-level and general agency
  threads). `partners-messages.html` + an admin inbox folded into `admin-mp-nominations.html`. Two-sided
  (`sender_side`), per-side unread counts, `ai_assisted` flag, attachments as signed URLs.
- **Notifications** — fired on: agency verified/rejected · new job matching your candidates · nomination
  status change · dedupe block · interview proposed/confirmed · offer extended · statement issued/paid ·
  new message. In-portal bell + email.
- **Fan-out** — one Postgres trigger → `pg_net` → **`mp-notify`** edge fn, reusing the repo's hardened
  pattern (`trg_notify_interest → notify-interest`: server-fixed recipients, `x-internal-secret` header)
  and `_shared/gh-email-shell.ts`.
- **`mp-digest`** — daily cron: per agency, new matching jobs + nominations awaiting their action +
  status changes + unread messages.

---

## 9. Security

- **Chunk-1 RLS remediation (§4.4) is the gate** — nothing else builds until it passes its test.
- All `gh_mp_*` views `security_invoker`; `anon` granted nothing.
- Every edge fn: verify JWT → resolve agency membership (`mp_agency_members`, `status='active'`) → scope
  every query by `agency_id`. Admin fns re-check `globalhire.is_admin()` server-side.
- `screen.html` — token is the auth, `verify_jwt=false` (persisted in `supabase/config.toml`),
  token expiring + rate-limited.
- `mp_candidates.passport_number` full value — column privilege revoked from the view's invoker role;
  partners see `passport_last4` only. `mp-nominate` / `mp-parse-documents` read it via service role.
- Storage RLS on `gh-applicant-documents` — a policy scoping `marketplace/agency/{agency_id}/…` to active
  membership of that agency.
- `mp-notify` / `mp-digest` — server-fixed recipients, `x-internal-secret == INTERNAL_TRIGGER_SECRET`
  (existing secret; if rotated, update the function env **and** the trigger SQL — see the 2026-06-09
  note in `docs/…/project_globalhire_recruitment`).
- Employer-confidential jobs — `gh_mp_jobs` view masks `employer_name` for non-admin when
  `employer_confidential = true`.

---

## 10. Error handling & testing

### 10.1 Edge cases

| Case | Handling |
|---|---|
| Two agencies nominate the same person within seconds | Partial unique index on `mp_claims(identity_hash) WHERE active` fails the 2nd INSERT; `mp-nominate` catches the unique violation, re-reads the claim, returns `blocked_claimed`. No double claim possible. |
| AI parse failure | Fall back to the manual form with a banner; no candidate lost. |
| AI match failure | Card shows "score unavailable — retry"; nomination still allowed. |
| AI screening failure / declined | Nomination proceeds without a report. |
| AI draft failure | Empty editor; human writes it. |
| `MP_AI_ENABLED=false` | All of the above degradations apply at once, cleanly. |
| Unverified agency | Can log in / finish profile / invite team; job board + nominate hard-gated server-side. |
| Claim expired but nomination later advances | Expiry cron checks nomination status first; a nomination reaching `shortlisted` re-opens the claim. |
| Own-agency duplicate candidate | Soft warn + merge tool, never hard block. |
| Malformed / unreadable PDF | `mp-parse-documents` returns `ai_flags: ['unreadable']`; doc `status='rejected'`. |
| Placement `fallout` in guarantee | Admin voids the statement or posts a negative adjustment; audit preserved. |

### 10.2 Automated tests

- **`node --test`** (repo already uses this for `home-openings`, visa rules): `mp-identity` (hash +
  fuzzy-match cases, diacritics, token order), claim-expiry decision function, `mp-match` pre-filter,
  statement math, nomination state-machine transition table.
- **Deno tests:** `mp-nominate` dedupe/claim branches (mocked DB) — clear / blocked-claimed /
  expired-collision / own-agency-dup / race; `mp-match` pre-filter; AI-JSON schema validation for each
  `mp-prompts` schema.

### 10.3 RLS + E2E

- **RLS SQL test script** — proves Agency A cannot read or write Agency B's `mp_candidates`,
  `mp_nominations`, `mp_threads`, `mp_messages`, `mp_statements`, `mp_candidate_documents`; and that
  `anon` can do nothing on any `gh_mp_*` view. Runs against a scratch/local project. **This is the
  acceptance test for build chunk 1.**
- **Manual E2E checklist:** signup → admin verify → add candidate (AI parse, correct a flagged field) →
  nominate → 2nd agency nominates same person → dedupe block → admin advances → interview proposed +
  confirmed → offer extended + accepted → placement started → statement issued → payment recorded →
  partner sees "paid".

---

## 11. Page & function inventory

### 11.1 Partner pages (new — `partners-*.html` + `js/mp-*.js`, dark portal theme)

`partners-signup` · `partners-onboarding` (profile + team; gated until verified) · `partners-dashboard`
(pending actions, fit alerts, pipeline snapshot, statements due) · `partners-jobs` · `partners-job` ·
`partners-candidates` · `partners-candidate` · `partners-nominations` · `partners-nomination` ·
`partners-messages` · `partners-billing` · `partners-team` · `screen.html?token=` (public)

### 11.2 Admin pages

`recruiters.html` **+ Agencies tab** (verification queue: verify / reject / suspend) · `admin-mp-jobs` ·
`admin-mp-nominations` (queue + inbox) · `admin-mp-nomination` (pipeline cockpit) · `admin-mp-statements`
· `admin-mp-screening-templates` · `admin-mp-ai` (`mp_ai_runs` cost/usage view)

### 11.3 Edge functions (new)

`mp-agency-register` · `mp-agency-verify` · `mp-parse-documents` · `mp-nominate` · `mp-match` ·
`mp-match-batch` (cron) · `mp-screen-start` · `mp-screen-turn` · `mp-screen-score` · `mp-draft` ·
`mp-notify` (trigger fan-out) · `mp-digest` (cron) · `mp-claims-expiry` (cron) · `mp-candidate-doc`
(agency-scoped signed URLs)

**Shared:** `_shared/mp-ai.ts` · `_shared/mp-prompts/` · `_shared/mp-identity.ts`
**Reused:** `_shared/cors.ts` · `_shared/gh-email-shell.ts` · `gh-applicant-documents` bucket · existing
Supabase auth

---

## 12. Build sequence (chunks for the implementation plan)

1. **Security remediation + tenancy** — RLS fixes (§4.4); `mp_agencies` / `mp_agency_members` /
   `mp_agency_invites` + views + RLS; recruiter→agency migration; `partners-signup` + `mp-agency-register`;
   admin Agencies tab + `mp-agency-verify`; `_shared/mp-ai.ts` skeleton + `mp_ai_runs`.
   **Acceptance:** the §10.3 RLS test script passes.
2. **Job board** — `mp_jobs` + views + RLS; `admin-mp-jobs`; `partners-jobs` / `partners-job` (no match
   badge yet); "create from campaign".
3. **Candidate intake (manual)** — `mp_candidates` / `mp_candidate_documents` + storage RLS;
   `partners-candidates` / `partners-candidate` manual path; `mp-candidate-doc`.
4. **AI parsing** — `mp-parse-documents` + upload-first flow + review/confirm UI + `ai_flags`.
5. **Identity + nomination + claims** — `_shared/mp-identity.ts`; `mp_claims` / `mp_nominations` /
   `mp_nomination_events` / `mp_dedupe_checks`; `mp-nominate`; `partners-nominations` /
   `partners-nomination`; `admin-mp-nominations`; `mp-claims-expiry` cron.
6. **AI matching** — `mp_match_scores` / `mp_job_fit_alerts`; `mp-match` + `mp-match-batch`; match badges +
   ranked picker + fit alerts.
7. **AI screening** — `mp_screening_templates` + `admin-mp-screening-templates`; `mp-screen-*`;
   `screen.html`; report on the nomination.
8. **AI comms** — `mp-draft` + draft buttons across nomination / thread / admin surfaces.
9. **Pipeline** — `mp_interviews` / `mp_offers` / `mp_placements`; `admin-mp-nomination` cockpit; partner
   read views.
10. **Ledger** — `mp_statements` / `mp_statement_payments`; `admin-mp-statements`; `partners-billing`.
11. **Messaging + notifications** — `mp_threads` / `mp_messages` / `mp_notifications`; `partners-messages`
    + admin inbox; `mp-notify` trigger + `mp-digest` cron; bell UI.
12. **Hardening pass** — RLS test script re-run against the full schema, E2E checklist, AI cost review,
    `admin-mp-ai`.

---

## 13. Open risks

- **RLS remediation regression** — many existing pages write via `gh_profiles`; converting those views to
  `security_invoker` can break writes. Chunk 1 needs a full click-test of the existing recruiter/admin
  pages, not just the new RLS test.
- **`identity_hash` collisions / misses** — common names + missing passport/licence produce weak hashes.
  Mitigation: the nomination gate (§6.3 step 1) forces at least one hard identifier; the expired-collision
  admin-review flag catches the rest. Monitor `mp_dedupe_checks` in the hardening pass.
- **AI matching trust** — if partners don't believe the scores, the feature is dead weight. The rationale
  (`fits[]` / `gaps[]` / `risks[]`) matters more than the number; validate rationale quality on real jobs
  before switching on fit-alert emails.
- **Claim fairness disputes** — two agencies genuinely sourcing the same candidate independently. The
  6-month window + owner early-release + admin override are the pressure valves; a written claims policy
  (surfaced in `partners-onboarding`) is needed before launch.
- **Provider direction** — the repo standard is Claude; the ELAB brief wants Qwen/DeepSeek. `mp-ai.ts`
  isolates this, but the gateway migration is unscheduled and unowned.
- **Scope** — Phase 1 is 12 chunks. Each chunk should ship and be usable on its own (chunks 1–5 already
  give a working manual marketplace); resist bundling.
- **Legacy flow coexistence** — the old "eLab assigns a candidate to a recruiter" tables stay live
  alongside `mp_*`. Admin UI will show both models until the later migration; document this so it doesn't
  read as a bug.

---

## 14. Spec self-review

- **Placeholders:** none — no TBD/TODO; every table has its columns, every chunk has an acceptance or
  deliverable.
- **Consistency:** nomination status enum is identical in §3-adjacent prose, §5.4, §6.3, §8.1, §10.2.
  Claim duration (6 months) consistent §2.6 / §5.4 / §6.3. `partner_split_pct` default 50 consistent
  §5.2 / §8.2.
- **Scope:** Phase 1 is large but coherent (one loop, one tenant model); §12 decomposes it into
  independently-shippable chunks, which is how the implementation plan will consume it. Not further split
  into sub-specs because the data model is one interlocking whole — splitting it would create more
  integration seams than it removes.
- **Ambiguity resolved:** "claim opens on nomination" (not on candidate add); screening is advisory and
  never auto-acts; AI never commits identity fields without partner confirmation; GH admin owns the
  pipeline from `employer_submitted` on; money is ledger-only with off-platform payment.
