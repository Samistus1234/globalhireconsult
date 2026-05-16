# Saudi Visa Services — Design Spec

**Date:** 2026-05-16
**Project:** GlobalHire@ELAB
**Status:** Draft (awaiting partner data + user review)

---

## 1. Problem & Goal

A partner (full-spectrum Saudi visa specialist, MoFA-licensed) wants ELAB to put their service in front of our audience. We have leverage — existing healthcare-migration funnel through GlobalHire, an Iqama-holder base who routinely need family/domestic-worker visas, and a public reach we can extend.

**Goal:** stand up a productized Saudi Visa Services line on GlobalHire@ELAB that:

- Captures both our existing Iqama-holder candidates (Family Visit, Family Residence, Domestic Worker) and the general public (Tourist, Umrah, Hajj, Business)
- Lets ELAB own the candidate relationship and a real margin while the partner handles the regulated visa submission in the background
- Ships a focused MVP fast (target ~6 dev-weeks after partner data is in hand) and grows the catalog after demand is proven

**Out of scope:** non-Saudi visas, recruitment / job placement (covered by GlobalHire's existing core), academy / exam services.

---

## 2. Strategic Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Property | **GlobalHire@ELAB** | Already operates Saudi-bound funnel, has the candidate dashboard, schema already includes a `visa` migration stage |
| Branding model | **Co-branded** | Partner has a regulated MoFA licence that must appear on receipts/visa documents; full white-label would be dishonest |
| Operating model | **Full Case Management** | ELAB runs the case end-to-end; partner is silent submitter. Highest margin, mirrors how DataFlow / Mumarisplus already operate |
| Audience | **Hybrid** | Public `/visa` hub for Tourist/Umrah/Hajj/Business; dashboard module surfaces Family Visit / Residence / Domestic Worker to existing healthcare candidates |
| Pricing model | **"From $X" + free eligibility quiz + $50 deposit + balance after intake** | Productized feel for fixed-fee visas; gracefully consultative for variable-fee ones (Hajj, Premium Residency, Investor) |
| Information architecture | **Hybrid: outcome wizard + catalog** | Hero wizard ("I want to…") solves "I don't know which visa I need"; catalog underneath serves confident self-servers |

---

## 3. Visa Catalog (11 categories)

| Visa type | Slug | Tier (v1 / v2 / v3) | Pricing pattern |
|---|---|---|---|
| Tourist eVisa | `tourist-evisa` | v1 | Productized, fixed |
| Umrah | `umrah` | v1 | Productized, fixed |
| Family Visit | `family-visit` | v1 | Productized, fixed |
| Family Residence (Iqama dependents) | `family-residence` | v1 | "From $X" + variable |
| Business Visit | `business-visit` | v2 | Productized, fixed |
| Domestic Worker | `domestic-worker` | v2 | "From $X" + variable |
| Work & Iqama | `work-iqama` | v2 | "From $X" + variable; cross-sells with DataFlow + Mumarisplus |
| Hajj | `hajj` | v3 | Quota-controlled, consultative |
| Premium Residency | `premium-residency` | v3 | High-ticket, consultative |
| Investor (MISA) | `investor-misa` | v3 | High-ticket, consultative |
| Transit | `transit` | v3 | Upsell on Tourist enquiries |

---

## 4. Information Architecture

### 4.1 Public hub (unauthenticated, SEO targets)

- `/visa` — hero outcome wizard + catalog grid
- `/visa/eligibility/:outcome` — wizard step 2 (nationality, dates, sponsor) → routes to a visa page
- `/visa/:slug` — per-visa detail (price, requirements, FAQ, "Check eligibility")
- `/visa/start/:slug` — intake form (post-eligibility) → account creation → $50 deposit
- `/visa/about` — co-branding: partner identity, MoFA licence, trust signals

### 4.2 Candidate dashboard (authenticated, existing GlobalHire shell)

- `/dashboard` — gains a "Visa Services" module. For Iqama-holders, surfaces Family Visit / Residence / Domestic Worker. For others, a discover card linking to `/visa`.
- `/dashboard/visas` — list of the candidate's cases (status pill, ETA, next action) — same component pattern as DataFlow / Mumarisplus cards
- `/dashboard/visas/:caseId` — case detail, doc upload, message thread, invoices, visa PDF download
- `/dashboard/visas/new` — same wizard as the public hub but pre-filled from candidate profile

### 4.3 Admin (existing GlobalHire admin pages, sibling of `elab-complete-admin.html`)

- Case queue filtered by visa-type / status
- Intake review surface (accept / request revision / reject)
- "Submit to partner" action with channel-specific payload preview
- Manual status update + reference-number capture (for v1 email-based submission)

### 4.4 Navigation placement

GlobalHire main nav gains a top-level **Visas ▾** between *Jobs* and *About*. Submenu: Tourist eVisa · Umrah · Family Visit · Family Residence · *See all visas*. Items added per-tier; v1 ships only the four v1 visas in the submenu, with "More visas coming" deflection on v2/v3 stubs.

---

## 5. Page Anatomy

### 5.1 `/visa` — Hub

- **Hero:** subtle co-branding line ("In partnership with [Partner Name] · MoFA-licensed"), headline "Find your Saudi visa in 30 seconds.", sub "From $135 · No hidden fees · Submitted by licensed specialists"
- **Outcome wizard:** chip selector — `visit Saudi`, `go for Umrah`, `perform Hajj`, `bring my family`, `work in KSA`, `hire a helper`, `do business`, `live there permanently`. v1 chips that map to v2/v3 visas show a "Notify me + WhatsApp" deflection rather than a dead end.
- **Catalog grid:** 9 visa cards (v1 active, v2/v3 marked "Coming soon")
- **Trust strip:** MoFA licence · 10,000+ migrants placed · refundable deposit · WhatsApp 7 days

### 5.2 `/visa/:slug` — Visa Detail (e.g., Family Visit)

- Breadcrumb: `Visas › Family › Family Visit Visa`
- Headline + plain-English description
- **What's included:** MoFA submission by licensed partner, document review, status updates, visa PDF delivery
- **What you'll need:** required documents list per visa type
- **FAQ:** processing time, stay duration, extension/conversion, refund policy
- **Right rail price card:** "From $X" with breakdown (gov fee + ELAB service), primary CTA "Check eligibility (free)", secondary "Chat on WhatsApp"
- Footnote: "No payment until eligibility confirmed. $50 deposit unlocks your case. Final invoice after document review."

### 5.3 `/visa/start/:slug` — Intake & Deposit

- Three-step indicator (Eligibility ✓ · Documents ✓ · **Confirm & pay**)
- Confirm cards: applicant identity, sponsor (if applicable), travel dates, uploaded documents
- Right rail: deposit + estimated balance + total; primary CTA "Pay $50 & start case"; payment options Paystack / Stripe / Bank transfer; reassurance "Refundable if ineligible"

### 5.4 Dashboard module

Same component shell as existing dashboard cards. Visa Services card on `/dashboard` hero contextualizes per audience (Iqama-holder vs general). `/dashboard/visas` is a list view; `/dashboard/visas/:caseId` is the case workspace (timeline, docs, invoices, messages, PDF download).

---

## 6. Backend, Schema & Data Flow

### 6.1 System of record

Cases live in **GlobalHire's Supabase** project (`globalhire.*` schema). The existing `globalhire.profiles.current_stage` enum already includes `visa`; we extend that schema rather than introducing a parallel system. **Command Centre v2 is not in the loop for v1.** Staff manage visa cases through new admin pages alongside `elab-complete-admin.html`.

### 6.2 Schema additions

**Enums**

```sql
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
```

**Tables** (all in `globalhire` schema, RLS-scoped to candidate or admin role)

- `visa_leads` — anonymous wizard captures (no auth required). Columns: `id`, `created_at`, `outcome`, `suggested_visa_type`, `nationality`, `sponsor_iqama`, `contact_email`, `contact_phone`, `utm_*`, `session_id`
- `visa_cases` — one per case, candidate-owned. Columns: `id`, `created_at`, `candidate_id` (→ `auth.users`), `lead_id` (→ `visa_leads`), `visa_type`, `status`, `sponsor_iqama`, `sponsor_name`, `travel_dates`, `estimated_total_usd`, `deposit_paid_at`, `balance_invoiced_at`, `partner_reference`, `partner_submitted_at`, `issued_at`, `visa_pdf_path`, `refund_reason`, `current_state_changed_at`
- `visa_case_documents` — per-case doc set. Columns: `id`, `case_id`, `doc_kind`, `storage_path`, `uploaded_at`, `review_status` (`pending`/`accepted`/`rejected`), `reviewer_note`
- `visa_case_events` — immutable audit timeline. Columns: `id`, `case_id`, `created_at`, `actor_id`, `event_type`, `payload jsonb`
- `visa_invoices` — deposit + balance. Columns: `id`, `case_id`, `kind` (`deposit`/`balance`/`refund`), `amount_usd`, `provider` (`paystack`/`stripe`/`bank`), `provider_ref`, `status`, `paid_at`
- `partner_submissions` — outbound log. Columns: `id`, `case_id`, `submitted_at`, `channel` (`api`/`email`/`portal`), `request_payload jsonb`, `response_payload jsonb`, `partner_reference`, `partner_id` (forward-compat for multi-partner in v3)

**No new columns on `globalhire.profiles`** — `current_stage='visa'` already supported.

### 6.3 Edge functions (new, under `supabase/functions/`)

- `submit-visa-eligibility` — anonymous wizard intake → `visa_leads` row
- `check-visa-eligibility` — runs rule set per visa type, returns pass/fail + missing-docs list
- `start-visa-case` — auth required; creates `visa_cases` row, returns Paystack/Stripe payment link
- `payment-webhook` — Paystack & Stripe webhooks; marks deposit/balance paid, transitions state
- `submit-to-partner` — admin-triggered; packages docs + payload, sends via chosen channel (v1: email)
- `partner-status-sync` — inbound webhook OR scheduled poller that updates case status from partner
- `notify-visa-status` — sends email + WhatsApp on state transitions; reuses existing `notify-applicant` pattern

### 6.4 Sequence (lead → issued)

1. Candidate fills `/visa` wizard → `submit-visa-eligibility` creates `visa_leads`
2. Candidate completes wizard step 2 → `check-visa-eligibility` marks lead `eligibility_passed`
3. Candidate signs up (existing GlobalHire auth), uploads docs, hits "Pay $50" → `start-visa-case` creates `visa_cases` (status=`deposit_pending`)
4. Paystack/Stripe redirect → `payment-webhook` marks deposit paid → status `intake_in_review`
5. ELAB intake reviews docs → "Submit to partner" → `submit-to-partner` → status `submitted_to_partner`
6. Partner processes → `partner-status-sync` updates → status `partner_processing` then `approved`
7. Balance invoice released → candidate pays → status `issued` → visa PDF released to `/dashboard/visas/:caseId`

### 6.5 Payments

- **Paystack (NGN)** and **Stripe (USD/cards)** added in this spec — GlobalHire has no payment edge functions today
- Both feed `visa_invoices` uniformly via `payment-webhook`
- **Bank transfer** is an offline option for high-ticket cases (Premium Residency, Investor) with a manual `payment-confirm-bank` admin action — v2

### 6.6 Open question — partner submission interface

Resolved per partner conversation. Three channels supported in `partner_submissions.channel`:

- **API** (best) — `submit-to-partner` POSTs JSON + signed doc URLs, partner returns reference
- **Portal** (manual v1 fallback) — staff submits in partner's web portal, pastes reference back into admin
- **Email** (v1 baseline) — `submit-to-partner` sends a structured email with attachments to a partner inbox; status sync via reply parsing or manual update

**v1 ships with email channel.** Upgrade to API in v3 once partner exposes one.

---

## 7. Operational Workflow

### 7.1 State machine

```
lead
  → eligibility_passed
    → deposit_pending
      → intake_in_review
        ↳ docs_revision (loop) | rejected_intake (refund)
        → submitted_to_partner
          → partner_processing
            ↳ rejected_partner (refund balance only)
            → approved
              → issued
```

Edge states: `refunded`, `stale` (no candidate action 14d), `on_hold` (partner queue).

### 7.2 Responsibility & SLAs

| State | Candidate | ELAB Intake | ELAB Admin | Partner | SLA |
|---|---|---|---|---|---|
| lead → eligibility_passed | Wizard | — | — | — | instant |
| eligibility_passed → deposit_pending | Sign up + upload docs | — | — | — | candidate-paced |
| intake_in_review | — | Reviews docs | — | — | 24h |
| docs_revision (loop) | Re-upload | Re-review | — | — | 24h per loop |
| submitted_to_partner | — | — | Triggers submission, logs reference | Acknowledges | 48h |
| partner_processing | — | — | Monitors, escalates if stale | Processes with MoFA | per visa type * |
| approved → issued | Pays balance | — | Releases visa PDF on payment | Delivers visa | 24h after balance paid |

\* Per-visa-type SLA targets: Tourist eVisa 5–7 days, Umrah 3–5 days, Family Visit 7–14 days, Family Residence 4–8 weeks, Hajj seasonal, Premium Residency 2–6 months.

### 7.3 Partner handoff playbook

**`submit-to-partner` payload includes:**

- ELAB case reference, visa type, candidate full name, passport number/scan
- Sponsor details (name, Iqama, salary cert) where applicable
- All accepted documents as signed time-bound URLs (or attachments if email channel)
- Travel dates, intended stay, contact phone
- Co-branding header: "Submitted by ELAB on behalf of [candidate], partner of [Partner Name]"

**Expected partner response:**

- Acknowledgement within 48h with partner-side reference number
- Status updates on (a) submission to MoFA, (b) MoFA decision, (c) visa issuance
- Final visa PDF + auxiliary docs (sponsor approval letter, fee receipt)

**Escalation:** if no partner response within 2× expected SLA, ELAB admin pings via designated WhatsApp template and pauses any candidate-visible "ETA" until resolution.

### 7.4 Edge cases & refund policy

- **Rejected at intake** (caught before submission) → **full refund of $50 deposit**, status `refunded`
- **Rejected by partner / MoFA** after submission → refund balance only; deposit retained as service fee. Reason recorded in `refund_reason`
- **Candidate stalls 14 days** after deposit → status `stale`, automated WhatsApp + email reminder, deposit forfeit after 30 days
- **Partner delay** beyond SLA → ELAB admin posts candidate-visible status ("Awaiting MoFA — escalated"); no fake ETAs
- **Document forgery / sanctions hit** → escalated to ELAB admin, partner not contacted, refund per intake rules
- **Expired passport during processing** → case paused, candidate prompted to renew; SLA does not breach until resumed
- **Quota visas (Hajj)** → wizard explicitly states "subject to quota and Saudi government approval — partner-side fees non-refundable if quota lottery is unsuccessful"

### 7.5 Notifications

Every state transition emits **email + WhatsApp** via the existing `notify-applicant` pattern. Templates: `deposit-received`, `intake-passed`, `intake-needs-revision`, `submitted-to-partner`, `approved-balance-due`, `issued-pdf-available`, `rejected-with-refund`. **Quiet hours:** no WhatsApp 22:00–07:00 candidate-local.

---

## 8. Visual / Brand System

### 8.1 Palette

Reuses GlobalHire's existing `css/tokens.css` — no new design system.

- **Primary** `#0077B6` — main CTAs, brand continuity with healthcare lines
- **Secondary** `#D4A84B` — visa-line accent on visa-specific CTAs and hero highlights
- **Success** `#2EC4B6`, **warning** `#F4A261`, **error** `#E63946` — semantic carry-over

### 8.2 Co-branding zones

| Surface | Treatment | Why |
|---|---|---|
| Public hub hero | Subtle line "In partnership with [Partner Name] · MoFA-licensed" above headline | Trust without distraction |
| Visa detail page | "What's included" bullet: "Submitted by our licensed partner under MoFA licence #XXXX" | Anchors regulatory proof |
| `/visa/about` | Partner logo, licence number, bio paragraph, MoFA registration screenshot | The page sceptics check |
| Receipts & invoices | "ELAB Visa Services — submitted by [Partner Name], MoFA #XXXX" | Required where regulated |
| Visa PDF / official docs | Untouched — partner / MoFA branding as issued | Authenticity |
| Email + WhatsApp | "From the ELAB Visa Services team" · footer "in partnership with [Partner Name]" | ELAB owns the relationship |

### 8.3 Trust strip (below hero on every visa page)

Four slots. Final copy depends on verified GlobalHire numbers — do not ship fabricated stats.

- ✓ MoFA-licensed (licence #`[XXXX]`)
- ✓ `[N+ candidates placed across GCC]` — fill from real placement count or replace with a different concrete proof point
- ✓ Refundable deposit if ineligible at intake
- ✓ WhatsApp support 7 days, 7am–10pm

### 8.4 Voice & tone

**Do:** plain English ("Bring your family to Saudi"); concrete numbers ("$210, 7–14 days"); name the partner where it earns trust; owe the candidate a status ("Awaiting MoFA — escalated") over fake ETAs; warm gold accent on visa-line CTAs.

**Don't:** "Guaranteed" / "100% approval" claims (illegal in some markets); hide the partner where regulators expect to see them; use non-Saudi imagery (Burj Khalifa is UAE); auto-generate testimonials; place marketing copy on regulatory surfaces (receipts, visa PDFs).

### 8.5 Visual continuity

The visa hub is a new section *inside* GlobalHire — same nav, same footer, same dark palette. **No microsite, no separate domain, no new fonts, no new components.** Reuses `css/tokens.css` and existing component CSS.

---

## 9. Rollout

### 9.1 Pre-launch dependencies (block v1)

1. **Partner conversation — written agreement on:**
   - Legal name + MoFA / Saudi licence number for receipts & about page
   - Wholesale price per visa type (drives "From $X" anchors)
   - SLA commitments per visa type
   - **Preferred submission channel** — API / portal / email (drives `submit-to-partner` implementation)
   - Status update mechanism — webhook / scheduled email / manual
   - Refund / dispute policy on partner side
2. **Payment processor accounts** — Paystack live keys (NGN), Stripe live keys (USD/cards), bank-transfer beneficiary
3. **Legal copy** — visa-specific T&Cs, refund policy, Hajj quota disclaimer; legal review before live
4. **Content** — for v1 visas only: requirements list, FAQ, eligibility rules per visa type

### 9.2 v1 — MVP (target: ~6 dev-weeks after blockers cleared)

- 4 visa types: Tourist eVisa, Umrah, Family Visit, Family Residence
- Public hub at `/visa` with outcome wizard + 4-card catalog
- Per-visa pages, eligibility wizard, intake + $50 deposit (Paystack + Stripe)
- Candidate dashboard module — list + case detail + doc upload
- Admin pages — case queue, intake review, "Submit to partner" (email channel)
- Notifications — email + WhatsApp for the seven core state transitions
- Co-branding on hub hero, visa pages, `/visa/about`, receipts

**Out of v1 scope:** Hajj, Business, Work & Iqama, Premium Residency, Investor, Transit, Domestic Worker — visible as "Coming soon" with WhatsApp deflection.

**v1 success metric:** first 10 paid cases delivered without a refund-causing operational failure.

### 9.3 v2 — Catalog expansion + funnel polish (~4 dev-weeks post-v1)

- Add Business Visit, Domestic Worker, Work & Iqama (the last cross-sells with DataFlow + Mumarisplus — needs joined-up case view)
- Eligibility quiz polish — branching logic, save-and-resume, pre-fill from existing GlobalHire profile
- Iqama-holder dashboard module — surface Family Visit / Family Residence / Domestic Worker on healthcare candidate dashboards
- SEO content — one canonical landing page per visa+market combo
- Bank-transfer flow for high-ticket Premium Residency lead capture
- Partner status sync upgrade — switch off email-poll if partner ships a webhook
- Real reviews & testimonials (only after we have them)

### 9.4 v3 — Scale + automation (~3 dev-weeks)

- Hajj quota workflow — seasonal opening, lottery handling, partial-refund rules
- Premium Residency & Investor MISA — full consultative flow with case officer assignment
- Partner API integration — live status push, automated visa PDF retrieval
- Multi-partner support via `partner_submissions.partner_id`
- Funnel analytics dashboard (wizard-start → eligibility-pass → deposit-paid → issued conversion rates)
- Self-serve refund — candidate-initiated cancel within 48h

### 9.5 Effort estimate (developer-weeks)

| Workstream | v1 | v2 | v3 |
|---|---|---|---|
| Schema + edge functions | 1.5 | 0.5 | 1 |
| Public hub + visa pages | 1.0 | 0.5 (+3 types) | 0.5 (+remaining) |
| Eligibility wizard | 0.5 | 0.5 | — |
| Payments (Paystack + Stripe) | 1.0 | 0.5 (bank) | — |
| Candidate dashboard module | 0.5 | 0.5 (Iqama) | — |
| Admin pages + intake review | 0.5 | 0.25 | 0.5 |
| Partner submission | 0.25 | 0.5 | 1 |
| Notifications + templates | 0.25 | 0.25 | — |
| QA, copy, legal review, soft-launch | 0.5 | 0.25 | 0.5 |
| **Total** | **~6.0** | **~3.75** | **~3.0** |

---

## 10. Open Items (non-blocking design questions)

- **Partner identity** — name, MoFA licence number — needed for all co-branded surfaces. Placeholder `[Partner Name]` until provided.
- **Wholesale pricing** — needed to publish "From $X" anchors. v1 launches with the 4 fixed-fee visas only because their pricing is most predictable.
- **Partner submission channel** — v1 spec assumes email + manual status updates as the safe baseline. Confirms or upgrades on the partner conversation.
- **Tax / VAT treatment** — Nigeria VAT rules on visa-service fees, Saudi VAT exemptions; legal to confirm before live.
- **WhatsApp templates** — to be drafted and submitted to Meta for approval before launch (24h template review).
- **`/visa/about` partner photography** — request from partner.
- **Trust-strip stats** — verify or replace placeholder claim about migrant placement count before launch.

---

## 11. Glossary

- **Iqama** — Saudi residence permit for foreign workers
- **MoFA** — Saudi Ministry of Foreign Affairs
- **Mumaris+ / Mumarisplus** — Saudi Commission for Health Specialties classification system (existing ELAB service)
- **Nusuk** — Saudi government platform for Umrah & Hajj services
- **MISA** — Saudi Ministry of Investment Authority (issues investor licences)
