# GlobalHire Recruiter Architecture — Design Spec

Date: 2026-07-02
Status: Draft for CEO review (not yet implemented)
Repo: GLOBALHIRE@ELAB · GlobalHire Supabase `evzhnsugmvtqgmvzwyix` · Ops CRM Supabase `fwmhfwprvqaovidykaqt`

## ⚠️ System split (read first)

Two separate systems, two separate databases:

- **GlobalHire website** (`globalhire.elabsolution.org`, repo GLOBALHIRE@ELAB, Supabase
  `evzhnsugmvtqgmvzwyix`) — recruiters, their candidates, the recruiter portal, admin candidate/recruiter
  management. **Feature A lives entirely here.**
- **ELAB Command Centre / ops CRM** (Supabase `fwmhfwprvqaovidykaqt`, driven by the `elab-ops-monitor`
  MCP) — where marketing **campaigns are sent from** (email_contacts, WhatsApp broadcasts).

The two DBs don't currently share a "this candidate belongs to recruiter X (opt-out)" signal. A recruiter's
candidate only reaches a campaign if they've also been added to the **Command Centre** contact list. So
**Feature B is inherently cross-system**: the opt-out toggle lives on **GlobalHire**, but suppression must
be enforced in the **Command Centre** audience builders — that bridge is the main work in Feature B.

## Goal

Two capabilities:

- **A. Recruiter candidate submission + admin review + status feedback** — recruiters upload their own
  candidates (with documents); GlobalHire admins see every submission tagged by source recruiter, act on
  it, and push a status back to the recruiter.
- **B. Per-recruiter campaign exclusion** — a per-recruiter toggle so a recruiter's candidates can be
  excluded from marketing campaigns (some recruiters don't want us contacting their applicants directly).
  Default = included; opt a recruiter OUT.

## Current state (as-is)

- Recruiter portal (`recruiter.html` + `js/recruiter.js`): recruiters only see **Assigned Candidates**
  (`gh_profiles` where `recruiter_id` = them), a pipeline view, and assessment notes (`gh_recruiter_notes`).
  No upload flow. Model = *eLab sources → assigns to recruiter → recruiter assesses.*
- Admin: `recruiters.html`/`js/recruiters-admin.js` approve/manage recruiters (`recruiter_approved`).
  `candidates.html`/`js/candidates.js` list all candidates, filter by `source`, and assign to recruiters.
- Latent asset: table **`recruiter_clients`** already exists (`recruiter_id, full_name, email, phone,
  profession, specialty, experience_years, current_country, target_countries, passport_number,
  license_number, status, profile_data, created_at`) — **0 rows, no UI**. We build onto this.
- Campaigns are sent from the **ops CRM** (different DB) via `email_contacts`. **No marketing-consent /
  do-not-contact flag exists anywhere, and nothing links a campaign contact to a source recruiter.**
- Candidate documents today use the `gh-applicant-documents` storage bucket + a `documents` table
  (used by the public offer-page apply flow).

## Feature A — Recruiter uploads candidates → admin review → status loop

### Data model (GlobalHire `evzhnsugmvtqgmvzwyix`)
- Reuse **`recruiter_clients`** as the submission record. Add columns:
  - `admin_status` text default `'submitted'` — enum: submitted · under_review · shortlisted · placed · rejected
  - `admin_note` text (message shown back to the recruiter)
  - `reviewed_by` uuid, `reviewed_at` timestamptz
  - `promoted_profile_id` uuid null (set if promoted into `gh_profiles`)
- New **`recruiter_client_documents`** (id, recruiter_client_id fk, doc_type, file_name, file_path,
  mime_type, file_size_bytes, status, created_at). Files in the existing `gh-applicant-documents` bucket
  under `recruiter-clients/{recruiter_id}/{client_id}/...`.
- RLS: recruiter can INSERT/SELECT/UPDATE only their own `recruiter_clients` + docs
  (`recruiter_id = auth.uid()`); status/admin_note writable only by admin (service-role or admin role).

### Recruiter portal (`recruiter.html` + `js/recruiter.js`)
- New sidebar tab **"My Candidates"** with an **"Add Candidate"** form: name, profession, specialty,
  experience, current country, target countries, passport/licence numbers, notes + **document uploads**
  (CV, licence, DataFlow, passport — same drag/drop pattern as the offer page).
- List of the recruiter's submitted candidates showing **admin_status** (badge) and **admin_note**
  (the feedback loop). Read-only once submitted except withdrawing.

### Admin (`candidates.html` or a new "Recruiter Submissions" view)
- Table of all `recruiter_clients` **grouped/tagged by source recruiter**, filter by recruiter + status.
- Row actions: view docs, set **admin_status**, write **admin_note**, and **"Promote to candidate pool"**
  (creates a `gh_profiles` row + copies docs, links `promoted_profile_id`).
- Optional: email/notify the recruiter when status changes (edge function or existing notify path).

## Feature B — Per-recruiter campaign exclusion

### Data model
- GlobalHire: add `allow_direct_marketing boolean default true` to the recruiter's `gh_profiles` row
  (admin toggle in `recruiters.html`). When false, that recruiter's candidates are "hands-off".
- Propagate to candidates: a candidate is excluded if it belongs to an opt-out recruiter — via
  `gh_profiles.recruiter_id` (assigned) and `recruiter_clients.recruiter_id` (submitted/promoted).
- Ops CRM: add **`do_not_market boolean default false`** to `email_contacts` (and honor on the person).
  Set it when a recruiter-owned candidate is created/synced into the CRM under an opt-out recruiter.

### Enforcement points (the important part)
Campaigns run from the **ops CRM MCP server** (`elab-ops-monitor`, 40-tool MCP on VPS). To actually
suppress excluded contacts, these must filter `do_not_market = false`:
- `email_audience_preview`, `email_campaign_create` (audience build), `bulk_broadcast`,
  `send_marketing_email`, WhatsApp broadcast audience.
- **Dependency/cost:** this requires editing the ops MCP server code (separate VPS deploy), not just the
  website. Until that ships, interim enforcement = maintain a suppression email list and subtract it when
  building `raw_emails` audiences (operator-side; less safe).
- Default = **include**; flipping a recruiter to `allow_direct_marketing = false` cascades exclusion to
  their candidates (email + WhatsApp).

## Cross-system note
Candidates live in **GlobalHire**; campaigns run from the **ops CRM**. Recruiter candidates only reach a
campaign when they're added to the CRM/marketing list. Exclusion must be enforced at that boundary (set
`do_not_market` on CRM contact when the owning recruiter is opt-out) AND in the audience builders.

## Build order (both, phased)
1. **B1 — recruiter opt-out toggle** (`allow_direct_marketing`) + admin UI in `recruiters.html`. Small.
2. **B2 — ops CRM suppression**: `do_not_market` column + audience-builder filters (MCP server change).
3. **A1 — recruiter upload**: `recruiter_clients` columns + docs table + RLS + recruiter portal "My Candidates".
4. **A2 — admin review**: submissions view, status/note, promote-to-pool + recruiter notification.

## Open questions / risks
- Confirm the recruiter created 2026-07-02 (shows as **NIKE ADEJUMOBI MURTALA**) is the one to opt out
  ("Gata Ruya" may be the agency name).
- Notify recruiters of status changes by email, in-portal only, or both?
- Ops MCP server change (B2) is the biggest dependency — confirm appetite, or accept interim suppression.
- RLS review before any recruiter-writable tables go live (avoid cross-recruiter data leaks).
