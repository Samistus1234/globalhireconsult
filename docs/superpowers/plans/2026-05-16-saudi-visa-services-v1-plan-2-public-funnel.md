# Saudi Visa Services v1 — Plan 2: Public Funnel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the unauthenticated `/visa` hub, the eligibility wizard, and four per-visa pages (Tourist eVisa, Umrah, Family Visit, Family Residence) so a candidate can land on the site, complete the wizard, and reach a "Sign up to continue" CTA. Anonymous wizard captures land in `visa_leads`.

**Architecture:** Vanilla HTML pages following GlobalHire's existing convention (one HTML file per page, shared `js/` + `css/` modules, `#gnav-placeholder` injected by `nav-global.js`). The wizard is a single client-side flow in `js/visa-wizard.js` calling two new edge functions (`submit-visa-eligibility`, `check-visa-eligibility`) that wrap the rule engine from Plan 1.

**Tech Stack:** HTML, vanilla JS, GlobalHire's `tokens.css` design system, Deno (edge functions), Playwright (e2e against deployed preview).

**Spec reference:** §4 (IA), §5.1–5.2 (Hub + Visa Detail), §6.3 (edge functions), §8 (Brand).

**Depends on:** Plan 1 must be applied (schema + types + rule engine).

---

## File Structure

| File | Responsibility |
|---|---|
| `js/nav-global.js` (modify) | Add the "Visas" dropdown group |
| `css/visa.css` (new) | Visa-section styles: wizard, catalog grid, visa-detail, trust strip — all on top of `tokens.css` |
| `visa.html` (new) | Public hub: hero, outcome wizard, catalog grid, trust strip |
| `visa-tourist-evisa.html` (new) | Tourist eVisa detail page |
| `visa-umrah.html` (new) | Umrah visa detail page |
| `visa-family-visit.html` (new) | Family Visit visa detail page |
| `visa-family-residence.html` (new) | Family Residence (Iqama dependents) detail page |
| `visa-about.html` (new) | Co-branding: partner identity, MoFA licence, trust signals |
| `js/visa-wizard.js` (new) | Wizard state, eligibility POST, deep-links to visa pages |
| `supabase/functions/submit-visa-eligibility/index.ts` (new) | Anonymous wizard intake → `visa_leads` |
| `supabase/functions/check-visa-eligibility/index.ts` (new) | Eligibility rule runner (HTTP wrapper around Plan 1's engine) |
| `tests/visa-funnel.spec.js` (new) | Playwright e2e: hub → wizard → visa detail |

---

### Task 1: Add Visas group to global nav

**Files:**
- Modify: `js/nav-global.js` (insert before the Scholarships top-level link)

- [ ] **Step 1: Open the file and locate the insertion point**

In `js/nav-global.js`, find the line:
```javascript
'<a href="scholarships.html"' + isActive(activePage, 'scholarships') + '>Scholarships</a>' +
```

- [ ] **Step 2: Insert a Visas dropdown group immediately before it**

```javascript
/* Visas dropdown */
'<div class="gnav-group" data-group="visas">' +
  '<button class="gnav-group-trigger">Visas ' + chevronSVG + '</button>' +
  '<div class="gnav-group-menu">' +
    '<a href="visa.html"' + isActive(activePage, 'visa') + '>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>' +
      'All Visa Services</a>' +
    '<a href="visa-tourist-evisa.html"' + isActive(activePage, 'visa-tourist') + '>Tourist eVisa</a>' +
    '<a href="visa-umrah.html"' + isActive(activePage, 'visa-umrah') + '>Umrah Visa</a>' +
    '<a href="visa-family-visit.html"' + isActive(activePage, 'visa-family-visit') + '>Family Visit</a>' +
    '<a href="visa-family-residence.html"' + isActive(activePage, 'visa-family-residence') + '>Family Residence</a>' +
    '<a href="visa-about.html"' + isActive(activePage, 'visa-about') + '>About this service</a>' +
  '</div>' +
'</div>' +
```

- [ ] **Step 3: Manual smoke — load any existing page and verify the Visas dropdown renders**

```bash
cd /Users/samuel/GLOBALHIRE@ELAB
python3 -m http.server 8000
# Open http://localhost:8000/index.html — confirm "Visas ▾" appears between Platform/About and Scholarships
```

- [ ] **Step 4: Commit**

```bash
git add js/nav-global.js
git commit -m "feat(nav): add Visas dropdown group"
```

---

### Task 2: Visa-section CSS

**Files:**
- Create: `css/visa.css`

- [ ] **Step 1: Write the file**

```css
/* ============================================
   GLOBALHIRE@ELAB — Visa Services styles
   Builds on tokens.css; warm gold accent for visa CTAs.
   ============================================ */

.visa-hero {
  padding: var(--space-12) 0 var(--space-8);
  background: radial-gradient(ellipse at top, var(--secondary-muted), transparent 70%);
}

.visa-cobrand-line {
  font-size: 0.75rem;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-secondary);
  text-align: center;
  margin-bottom: var(--space-3);
}

.visa-hero h1 {
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 800;
  line-height: 1.15;
  text-align: center;
  margin-bottom: var(--space-2);
}

.visa-hero .lede {
  text-align: center;
  color: var(--text-secondary);
  margin-bottom: var(--space-6);
}

.visa-wizard {
  background: var(--bg-surface);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: var(--space-6);
  max-width: 720px;
  margin: 0 auto;
}

.visa-wizard label {
  display: block;
  color: var(--text-primary);
  margin-bottom: var(--space-3);
  font-weight: 500;
}

.visa-outcome-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.visa-outcome-chip {
  padding: var(--space-2) var(--space-3);
  background: var(--bg-elevated);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.15s ease;
}

.visa-outcome-chip:hover {
  background: var(--bg-hover);
  border-color: var(--secondary);
}

.visa-outcome-chip[aria-selected="true"] {
  background: var(--secondary-muted);
  border-color: var(--secondary);
  color: var(--secondary-light);
}

.visa-wizard .field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.visa-wizard input[type="text"],
.visa-wizard input[type="email"],
.visa-wizard input[type="tel"],
.visa-wizard input[type="date"],
.visa-wizard select {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: var(--bg-elevated);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: inherit;
}

.visa-wizard input:focus,
.visa-wizard select:focus {
  outline: none;
  border-color: var(--secondary);
  box-shadow: 0 0 0 3px var(--secondary-muted);
}

.visa-cta-primary {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--secondary);
  color: var(--text-inverse);
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.15s ease;
  border: none;
  cursor: pointer;
}

.visa-cta-primary:hover {
  background: var(--secondary-light);
}

.visa-cta-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.visa-trust-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
  margin: var(--space-8) 0;
}

.visa-trust-item {
  padding: var(--space-3) var(--space-4);
  background: var(--bg-surface);
  border-left: 3px solid var(--accent-teal);
  border-radius: 4px;
}

.visa-trust-item strong { color: var(--accent-teal); display: block; margin-bottom: 4px; }

.visa-catalog {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-6);
}

.visa-catalog-card {
  padding: var(--space-4);
  background: var(--bg-card);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  text-decoration: none;
  color: var(--text-primary);
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.visa-catalog-card:hover {
  transform: translateY(-2px);
  border-color: var(--secondary);
}

.visa-catalog-card[data-status="coming-soon"] {
  opacity: 0.55;
  cursor: not-allowed;
}

.visa-catalog-card h3 { margin: 0 0 var(--space-1); font-size: 1.125rem; }
.visa-catalog-card .price { color: var(--secondary-light); font-weight: 600; }
.visa-catalog-card .meta { color: var(--text-secondary); font-size: 0.875rem; }

/* ── Visa detail page ── */
.visa-detail {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-6);
  padding: var(--space-8) 0;
}

@media (max-width: 720px) {
  .visa-detail { grid-template-columns: 1fr; }
  .visa-wizard .field-row { grid-template-columns: 1fr; }
}

.visa-detail-content h1 { margin-top: 0; }
.visa-detail-content h2 { margin-top: var(--space-6); font-size: 1.25rem; }
.visa-detail-content ul { padding-left: 1.25rem; line-height: 1.7; }

.visa-price-card {
  position: sticky;
  top: 100px;
  padding: var(--space-5);
  background: var(--bg-surface);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  height: fit-content;
}

.visa-price-card .from { color: var(--text-secondary); font-size: 0.875rem; }
.visa-price-card .price { font-size: 2rem; font-weight: 700; color: var(--secondary-light); margin: 4px 0; }
.visa-price-card .breakdown { color: var(--text-secondary); font-size: 0.8125rem; margin-bottom: var(--space-3); }
```

- [ ] **Step 2: Smoke render — load `visa.html` after Task 6 ships**

(No standalone test for CSS; Playwright e2e in Task 12 covers visual regression of the rendered page.)

- [ ] **Step 3: Commit**

```bash
git add css/visa.css
git commit -m "feat(css): visa-section styles using existing design tokens"
```

---

### Task 3: `submit-visa-eligibility` edge function (TDD)

**Files:**
- Create: `supabase/functions/submit-visa-eligibility/index.ts`
- Test: `supabase/functions/submit-visa-eligibility/index_test.ts`

This is the wizard's first POST: it stores an anonymous lead and returns a `lead_id` plus the suggested visa.

- [ ] **Step 1: Write the failing test**

```typescript
// supabase/functions/submit-visa-eligibility/index_test.ts
import { assertEquals } from '@std/assert';
import { buildLeadRow, type WizardSubmission } from './index.ts';

Deno.test('buildLeadRow maps wizard outcome to visa type', () => {
  const sub: WizardSubmission = {
    outcome: 'bring-my-family',
    nationality: 'NG',
    sponsor_iqama: '2456789012',
    contact_email: 'a@b.com',
  };
  const row = buildLeadRow(sub, 'sess-123', { utm_source: 'meta' });
  assertEquals(row.outcome, 'bring-my-family');
  assertEquals(row.suggested_visa, 'family_visit');
  assertEquals(row.session_id, 'sess-123');
  assertEquals(row.utm_source, 'meta');
});

Deno.test('buildLeadRow handles unknown outcome with null suggested_visa', () => {
  const sub: WizardSubmission = { outcome: 'do-something-weird' };
  const row = buildLeadRow(sub, 'sess-x', {});
  assertEquals(row.suggested_visa, null);
});

Deno.test('buildLeadRow strips fields not in the schema', () => {
  // deno-lint-ignore no-explicit-any
  const sub = { outcome: 'visit-saudi', nationality: 'NG', evil: 'INJECTION' } as any;
  const row = buildLeadRow(sub, 'sess', {});
  assertEquals('evil' in row, false);
});
```

- [ ] **Step 2: Run test — expect failure (module missing)**

```bash
cd /Users/samuel/GLOBALHIRE@ELAB/supabase/functions
deno task test submit-visa-eligibility/index_test.ts
```

Expected: `Module not found "./index.ts"`.

- [ ] **Step 3: Write the edge function**

```typescript
// supabase/functions/submit-visa-eligibility/index.ts
// POST /submit-visa-eligibility — anonymous, called by the wizard.
// Body: { outcome, nationality?, sponsor_iqama?, contact_email?, contact_phone?, session_id?, utm_*? }
// Returns: { lead_id, suggested_visa: VisaType | null }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { OUTCOME_TO_VISA, type VisaType } from '../_shared/visa-types.ts';

export interface WizardSubmission {
  outcome: string;
  nationality?: string;
  sponsor_iqama?: string;
  contact_email?: string;
  contact_phone?: string;
}

interface UTM {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export interface LeadRow {
  outcome: string;
  suggested_visa: VisaType | null;
  nationality: string | null;
  sponsor_iqama: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  session_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

export function buildLeadRow(sub: WizardSubmission, sessionId: string, utm: UTM): LeadRow {
  return {
    outcome:        sub.outcome,
    suggested_visa: OUTCOME_TO_VISA[sub.outcome] ?? null,
    nationality:    sub.nationality ?? null,
    sponsor_iqama:  sub.sponsor_iqama ?? null,
    contact_email:  sub.contact_email ?? null,
    contact_phone:  sub.contact_phone ?? null,
    session_id:     sessionId,
    utm_source:     utm.utm_source ?? null,
    utm_medium:     utm.utm_medium ?? null,
    utm_campaign:   utm.utm_campaign ?? null,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.outcome !== 'string') {
    return new Response(JSON.stringify({ error: 'outcome (string) required' }), {
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const sessionId = body.session_id ?? crypto.randomUUID();
  const utm: UTM = {
    utm_source:   body.utm_source,
    utm_medium:   body.utm_medium,
    utm_campaign: body.utm_campaign,
  };
  const row = buildLeadRow(body, sessionId, utm);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'globalhire' } },
  );

  const { data, error } = await supabase
    .from('visa_leads')
    .insert(row)
    .select('id, suggested_visa')
    .single();

  if (error) {
    console.error('visa_leads insert failed', error);
    return new Response(JSON.stringify({ error: 'database insert failed' }), {
      status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ lead_id: data.id, suggested_visa: data.suggested_visa }), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
```

- [ ] **Step 4: Run tests — expect pass**

```bash
deno task test submit-visa-eligibility/index_test.ts
```

Expected: `3 passed | 0 failed`.

- [ ] **Step 5: Deploy locally and curl-test**

```bash
supabase functions serve submit-visa-eligibility --env-file ./supabase/.env.local
# In another terminal:
curl -X POST http://127.0.0.1:54321/functions/v1/submit-visa-eligibility \
  -H 'content-type: application/json' \
  -d '{"outcome":"bring-my-family","nationality":"NG","sponsor_iqama":"2456789012"}'
```

Expected: `{"lead_id":"<uuid>","suggested_visa":"family_visit"}`. In Supabase SQL Editor:
```sql
SELECT * FROM globalhire.visa_leads WHERE outcome = 'bring-my-family' ORDER BY created_at DESC LIMIT 1;
```

- [ ] **Step 6: Deploy to production**

```bash
supabase functions deploy submit-visa-eligibility --project-ref <ref-from-supabase-config>
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/submit-visa-eligibility/
git commit -m "feat(fn): submit-visa-eligibility — anonymous wizard intake"
```

---

### Task 4: `check-visa-eligibility` edge function (TDD)

**Files:**
- Create: `supabase/functions/check-visa-eligibility/index.ts`
- Test: `supabase/functions/check-visa-eligibility/index_test.ts`

Wraps the rule engine from Plan 1, marks the lead `passed_eligibility=true` on success.

- [ ] **Step 1: Write the failing test**

```typescript
// supabase/functions/check-visa-eligibility/index_test.ts
import { assertEquals } from '@std/assert';
import { extractEligibilityInput } from './index.ts';

Deno.test('extractEligibilityInput coerces visa_type and copies allowed fields', () => {
  const out = extractEligibilityInput({
    visa_type: 'family_visit',
    nationality: 'NG',
    sponsor_iqama: '2456789012',
    sponsor_relationship: 'spouse',
    travel_dates: { arrival: '2026-08-01', stay_days: 30 },
    junk: 'ignored',
  });
  assertEquals(out.visa_type, 'family_visit');
  assertEquals(out.sponsor_relationship, 'spouse');
  assertEquals(out.travel_dates?.stay_days, 30);
  // deno-lint-ignore no-explicit-any
  assertEquals((out as any).junk, undefined);
});

Deno.test('extractEligibilityInput throws on missing visa_type', () => {
  let threw = false;
  try { extractEligibilityInput({ nationality: 'NG' }); } catch { threw = true; }
  assertEquals(threw, true);
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
deno task test check-visa-eligibility/index_test.ts
```

- [ ] **Step 3: Write the edge function**

```typescript
// supabase/functions/check-visa-eligibility/index.ts
// POST /check-visa-eligibility — anonymous, called by wizard step 2.
// Body: { lead_id?, visa_type, nationality?, sponsor_iqama?, sponsor_relationship?, travel_dates? }
// Returns: { passed: boolean, missingDocs, reasons }
// Side effect: if lead_id provided AND passed=true, sets visa_leads.passed_eligibility=true.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { runEligibility, type EligibilityInput } from '../_shared/visa-eligibility-rules.ts';
import type { VisaType } from '../_shared/visa-types.ts';

const VALID_VISA_TYPES: ReadonlyArray<VisaType> = [
  'tourist','umrah','hajj','family_visit','family_residence','business',
  'work_iqama','premium_residency','investor_misa','transit','domestic_worker',
];

const VALID_RELATIONSHIPS = ['spouse','child','parent'] as const;

// deno-lint-ignore no-explicit-any
export function extractEligibilityInput(body: any): EligibilityInput {
  if (!body?.visa_type || !VALID_VISA_TYPES.includes(body.visa_type)) {
    throw new Error('visa_type required and must be a known visa type');
  }
  return {
    visa_type:            body.visa_type,
    nationality:          typeof body.nationality === 'string' ? body.nationality : undefined,
    sponsor_iqama:        typeof body.sponsor_iqama === 'string' ? body.sponsor_iqama : undefined,
    sponsor_relationship: VALID_RELATIONSHIPS.includes(body.sponsor_relationship) ? body.sponsor_relationship : undefined,
    travel_dates:         body.travel_dates && typeof body.travel_dates === 'object' ? {
      arrival:    typeof body.travel_dates.arrival === 'string'  ? body.travel_dates.arrival  : undefined,
      stay_days:  typeof body.travel_dates.stay_days === 'number' ? body.travel_dates.stay_days : undefined,
    } : undefined,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);

  let input: EligibilityInput;
  try {
    input = extractEligibilityInput(body);
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const result = runEligibility(input);

  // Side-effect: mark lead as passed if applicable
  if (result.passed && body?.lead_id && typeof body.lead_id === 'string') {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { db: { schema: 'globalhire' } },
    );
    await supabase
      .from('visa_leads')
      .update({ passed_eligibility: true, suggested_visa: input.visa_type })
      .eq('id', body.lead_id);
  }

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
```

- [ ] **Step 4: Run tests — expect pass**

```bash
deno task test check-visa-eligibility/index_test.ts
```

- [ ] **Step 5: Deploy & curl-test**

```bash
supabase functions deploy check-visa-eligibility --project-ref <ref>

curl -X POST https://<ref>.functions.supabase.co/check-visa-eligibility \
  -H 'content-type: application/json' \
  -d '{"visa_type":"family_visit","nationality":"NG","sponsor_iqama":"2456789012"}'
```

Expected: `{"passed":true,"missingDocs":["passport_bio","passport_photo","sponsor_iqama","salary_certificate"],"reasons":[]}`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/check-visa-eligibility/
git commit -m "feat(fn): check-visa-eligibility — rule-engine wrapper + lead update"
```

---

### Task 5: Wizard frontend logic

**Files:**
- Create: `js/visa-wizard.js`

- [ ] **Step 1: Write the file**

```javascript
/* ============================================
   GLOBALHIRE@ELAB — Visa wizard
   Two-step: outcome → eligibility → visa detail page.
   ============================================ */

(function () {
  'use strict';

  // Config — overridden by window.VISA_FN_BASE if set on the page
  // GlobalHire Supabase project ref (per js/supabase-client.js): evzhnsugmvtqgmvzwyix
  var FN_BASE = window.VISA_FN_BASE ||
    'https://' + (window.SUPABASE_REF || 'evzhnsugmvtqgmvzwyix') + '.functions.supabase.co';

  var OUTCOME_TO_PAGE = {
    'visit-saudi':     { v1: 'visa-tourist-evisa.html',     visaType: 'tourist' },
    'go-for-umrah':    { v1: 'visa-umrah.html',             visaType: 'umrah' },
    'bring-my-family': { v1: 'visa-family-visit.html',      visaType: 'family_visit' },
    'live-with-family':{ v1: 'visa-family-residence.html',  visaType: 'family_residence' },
    // v2/v3 outcomes — soft-deflect:
    'perform-hajj':       { comingSoon: true, label: 'Hajj' },
    'work-in-ksa':        { comingSoon: true, label: 'Work & Iqama' },
    'hire-a-helper':      { comingSoon: true, label: 'Domestic Worker' },
    'do-business':        { comingSoon: true, label: 'Business Visit' },
    'live-permanently':   { comingSoon: true, label: 'Premium Residency' },
  };

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function getUTM() {
    var p = new URLSearchParams(window.location.search);
    return {
      utm_source:   p.get('utm_source')   || undefined,
      utm_medium:   p.get('utm_medium')   || undefined,
      utm_campaign: p.get('utm_campaign') || undefined,
    };
  }

  function getSessionId() {
    var key = 'gh_visa_session';
    var sid = localStorage.getItem(key);
    if (!sid) {
      sid = 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(key, sid);
    }
    return sid;
  }

  function postJSON(path, body) {
    return fetch(FN_BASE + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  function showComingSoon(outcomeMeta) {
    var msg = $('#wizard-deflection');
    if (!msg) return;
    msg.hidden = false;
    msg.innerHTML =
      '<p><strong>' + outcomeMeta.label + '</strong> visas are coming soon. ' +
      'Tap WhatsApp and our team will help you start now.</p>' +
      '<a class="visa-cta-primary" href="https://wa.me/9295419232">Chat on WhatsApp</a>';
  }

  function init() {
    var chips = $$('.visa-outcome-chip');
    if (!chips.length) return;

    chips.forEach(function (chip) {
      chip.setAttribute('role', 'button');
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.setAttribute('aria-selected', 'false'); });
        chip.setAttribute('aria-selected', 'true');

        var outcome = chip.getAttribute('data-outcome');
        var meta = OUTCOME_TO_PAGE[outcome];
        if (!meta) return;

        if (meta.comingSoon) {
          showComingSoon(meta);
          return;
        }

        // Submit the lead, then route
        postJSON('/submit-visa-eligibility', Object.assign({
          outcome: outcome,
          session_id: getSessionId(),
        }, getUTM())).then(function (resp) {
          if (resp && resp.lead_id) {
            sessionStorage.setItem('gh_visa_lead_id', resp.lead_id);
          }
          window.location.href = meta.v1 + '?outcome=' + encodeURIComponent(outcome);
        }).catch(function () {
          // Fail open — still navigate, server will create lead from the visa page if needed
          window.location.href = meta.v1 + '?outcome=' + encodeURIComponent(outcome);
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 2: Smoke — included after Task 6 ships visa.html**

- [ ] **Step 3: Commit**

```bash
git add js/visa-wizard.js
git commit -m "feat(js): visa wizard — outcome routing + lead submission"
```

---

### Task 6: `visa.html` hub page

**Files:**
- Create: `visa.html`

- [ ] **Step 1: Write the file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Saudi Visa Services — GlobalHire@eLab</title>
  <meta name="description" content="Apply for Saudi visas — Tourist eVisa, Umrah, Family Visit, Family Residence — submitted by licensed specialists. Pay only $50 to start. Refundable if ineligible.">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/nav-global.css">
  <link rel="stylesheet" href="css/visa.css">

  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%230077B6'/><text x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='18' font-weight='bold' fill='%23ffffff'>G</text></svg>">
</head>
<body>
  <div class="page-bg" aria-hidden="true"></div>
  <div id="gnav-placeholder"></div>

  <main>
    <section class="visa-hero">
      <div class="container">
        <p class="visa-cobrand-line">In partnership with [Partner Name] · MoFA-licensed</p>
        <h1>Find your Saudi visa in 30 seconds.</h1>
        <p class="lede">From $135 · No hidden fees · Submitted by licensed specialists.</p>

        <div class="visa-wizard">
          <label>I want to…</label>
          <div class="visa-outcome-chips" role="group" aria-label="Choose your goal">
            <button type="button" class="visa-outcome-chip" data-outcome="visit-saudi"      aria-selected="false">visit Saudi</button>
            <button type="button" class="visa-outcome-chip" data-outcome="go-for-umrah"     aria-selected="false">go for Umrah</button>
            <button type="button" class="visa-outcome-chip" data-outcome="perform-hajj"     aria-selected="false">perform Hajj</button>
            <button type="button" class="visa-outcome-chip" data-outcome="bring-my-family"  aria-selected="false">bring my family</button>
            <button type="button" class="visa-outcome-chip" data-outcome="live-with-family" aria-selected="false">live with my family</button>
            <button type="button" class="visa-outcome-chip" data-outcome="work-in-ksa"      aria-selected="false">work in KSA</button>
            <button type="button" class="visa-outcome-chip" data-outcome="hire-a-helper"    aria-selected="false">hire a helper</button>
            <button type="button" class="visa-outcome-chip" data-outcome="do-business"      aria-selected="false">do business</button>
            <button type="button" class="visa-outcome-chip" data-outcome="live-permanently" aria-selected="false">live permanently</button>
          </div>
          <div id="wizard-deflection" class="section" hidden style="margin-top: var(--space-4);"></div>
        </div>
      </div>
    </section>

    <section class="container" style="padding-bottom: var(--space-8);">
      <p class="label" style="margin-bottom: var(--space-3);">Or browse all visa types</p>
      <div class="visa-catalog">
        <a class="visa-catalog-card" href="visa-tourist-evisa.html">
          <h3>Tourist eVisa</h3>
          <div class="price">From $185</div>
          <div class="meta">5–7 days · Single or multi-entry</div>
        </a>
        <a class="visa-catalog-card" href="visa-umrah.html">
          <h3>Umrah Visa</h3>
          <div class="price">From $295</div>
          <div class="meta">3–5 days · Year-round</div>
        </a>
        <a class="visa-catalog-card" href="visa-family-visit.html">
          <h3>Family Visit</h3>
          <div class="price">From $210</div>
          <div class="meta">7–14 days · Up to 90-day stay</div>
        </a>
        <a class="visa-catalog-card" href="visa-family-residence.html">
          <h3>Family Residence</h3>
          <div class="price">From $320</div>
          <div class="meta">4–8 weeks · Iqama dependents</div>
        </a>
        <div class="visa-catalog-card" data-status="coming-soon">
          <h3>Hajj</h3>
          <div class="price">Coming soon</div>
          <div class="meta">Quota-controlled · Annual</div>
        </div>
        <div class="visa-catalog-card" data-status="coming-soon">
          <h3>Business Visit</h3>
          <div class="price">Coming soon</div>
          <div class="meta">5–10 days · Commercial</div>
        </div>
        <div class="visa-catalog-card" data-status="coming-soon">
          <h3>Work &amp; Iqama</h3>
          <div class="price">Coming soon</div>
          <div class="meta">With DataFlow + Mumarisplus</div>
        </div>
        <div class="visa-catalog-card" data-status="coming-soon">
          <h3>Domestic Worker</h3>
          <div class="price">Coming soon</div>
          <div class="meta">3–6 weeks</div>
        </div>
        <div class="visa-catalog-card" data-status="coming-soon">
          <h3>Premium Residency</h3>
          <div class="price">Coming soon</div>
          <div class="meta">2–6 months</div>
        </div>
      </div>

      <div class="visa-trust-strip">
        <div class="visa-trust-item"><strong>✓ MoFA-licensed</strong>Submitted under partner licence #[XXXX]</div>
        <div class="visa-trust-item"><strong>✓ Tracked in your dashboard</strong>Real status, not fake ETAs</div>
        <div class="visa-trust-item"><strong>✓ Refundable deposit</strong>Full refund if ineligible at intake</div>
        <div class="visa-trust-item"><strong>✓ WhatsApp support 7 days</strong>Real humans, 7am–10pm</div>
      </div>
    </section>
  </main>

  <div id="gfooter-placeholder"></div>

  <script src="js/nav-global.js" data-active-page="visa"></script>
  <script src="js/visa-wizard.js"></script>
</body>
</html>
```

- [ ] **Step 2: Manual smoke**

```bash
python3 -m http.server 8000
# Open http://localhost:8000/visa.html
# - hero renders with co-brand line
# - 9 outcome chips visible
# - clicking "visit Saudi" navigates to visa-tourist-evisa.html (404 until Task 7)
# - clicking "perform Hajj" shows the WhatsApp deflection block
```

- [ ] **Step 3: Commit**

```bash
git add visa.html
git commit -m "feat(page): /visa hub with outcome wizard + catalog + trust strip"
```

---

### Task 7: `visa-tourist-evisa.html` detail page

**Files:**
- Create: `visa-tourist-evisa.html`

- [ ] **Step 1: Write the file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Saudi Tourist eVisa — GlobalHire@eLab</title>
  <meta name="description" content="Saudi Tourist eVisa, 1-year multiple-entry, 90 days per stay. From $185 all-in. Free eligibility check. Submitted by MoFA-licensed partner.">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/nav-global.css">
  <link rel="stylesheet" href="css/visa.css">
</head>
<body>
  <div class="page-bg" aria-hidden="true"></div>
  <div id="gnav-placeholder"></div>

  <main>
    <section class="container">
      <div class="visa-detail">
        <div class="visa-detail-content">
          <p class="label" style="opacity:.7;">Visas › Tourism › <strong>Tourist eVisa</strong></p>
          <h1>Saudi Tourist eVisa</h1>
          <p>1-year multiple-entry visa for tourism — leisure travel, AlUla, Red Sea, Saudi Season events. Up to 90 days per stay.</p>

          <h2>What's included</h2>
          <ul>
            <li>eVisa application submitted by our MoFA-licensed partner</li>
            <li>Document review &amp; eligibility verification</li>
            <li>WhatsApp + email status updates</li>
            <li>Visa PDF delivered to your dashboard</li>
          </ul>

          <h2>What you'll need</h2>
          <ul>
            <li>Passport bio page scan (valid 6+ months)</li>
            <li>Recent passport-style photo</li>
          </ul>

          <h2>Eligible nationalities</h2>
          <p>The Saudi tourist eVisa is available to citizens of approximately 60 countries. Common eligible nationalities in our markets include: Nigerian (with secondary residence in eligible country), British, US, EU, GCC residents, and many more. Our eligibility check confirms in seconds.</p>

          <h2>FAQ</h2>
          <p><strong>Processing time:</strong> 5–7 working days from clean submission.</p>
          <p><strong>How long can I stay?</strong> Up to 90 days per visit, 180 days total per year.</p>
          <p><strong>Refunds:</strong> $50 deposit fully refunded if we determine you're ineligible at intake. After submission, partner-side fees are non-refundable.</p>
        </div>

        <aside class="visa-price-card">
          <div class="from">From</div>
          <div class="price">$185</div>
          <div class="breakdown">Government fee $135 + ELAB service $50</div>
          <a class="visa-cta-primary" href="visa.html#wizard" style="display:block; text-align:center;">Check eligibility (free)</a>
          <a href="https://wa.me/9295419232" style="display:block; text-align:center; margin-top: var(--space-2); color: var(--text-secondary); font-size: 0.875rem;">Chat on WhatsApp</a>
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: var(--space-3); line-height:1.5;">No payment until eligibility confirmed. $50 deposit unlocks your case. Final invoice after document review.</p>
        </aside>
      </div>
    </section>
  </main>

  <div id="gfooter-placeholder"></div>
  <script src="js/nav-global.js" data-active-page="visa-tourist"></script>
</body>
</html>
```

- [ ] **Step 2: Manual smoke — load `/visa-tourist-evisa.html`, verify two-column layout**

- [ ] **Step 3: Commit**

```bash
git add visa-tourist-evisa.html
git commit -m "feat(page): visa detail — Tourist eVisa"
```

---

### Task 8: `visa-umrah.html` detail page

**Files:**
- Create: `visa-umrah.html`

- [ ] **Step 1: Write the file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Umrah Visa — GlobalHire@eLab</title>
  <meta name="description" content="Saudi Umrah visa year-round. From $295 all-in. Free eligibility check. Issued via Nusuk by our MoFA-licensed partner.">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/nav-global.css">
  <link rel="stylesheet" href="css/visa.css">
</head>
<body>
  <div class="page-bg" aria-hidden="true"></div>
  <div id="gnav-placeholder"></div>

  <main>
    <section class="container">
      <div class="visa-detail">
        <div class="visa-detail-content">
          <p class="label" style="opacity:.7;">Visas › Religious › <strong>Umrah Visa</strong></p>
          <h1>Umrah Visa</h1>
          <p>Religious pilgrimage visa for Umrah — year-round, single-entry, up to 30 days. Issued via Nusuk by our MoFA-licensed partner.</p>

          <h2>What's included</h2>
          <ul>
            <li>Nusuk submission by our licensed Umrah operator</li>
            <li>Document review</li>
            <li>WhatsApp + email status updates</li>
            <li>Visa PDF delivered to your dashboard</li>
          </ul>

          <h2>What you'll need</h2>
          <ul>
            <li>Passport bio page (valid 6+ months from arrival)</li>
            <li>Recent passport-style photo</li>
            <li>Female pilgrims under 40 — Mahram declaration may be required (we'll guide you)</li>
          </ul>

          <h2>FAQ</h2>
          <p><strong>Processing:</strong> 3–5 working days.</p>
          <p><strong>Stay:</strong> Up to 30 days for the purpose of Umrah pilgrimage.</p>
          <p><strong>Hajj:</strong> Umrah visas do not permit Hajj participation. Hajj is quota-controlled and we'll launch dedicated Hajj packages soon.</p>
          <p><strong>Refunds:</strong> $50 deposit refunded if ineligible at intake. Partner-side fees non-refundable after submission.</p>
        </div>

        <aside class="visa-price-card">
          <div class="from">From</div>
          <div class="price">$295</div>
          <div class="breakdown">Operator fee $245 + ELAB service $50</div>
          <a class="visa-cta-primary" href="visa.html#wizard" style="display:block; text-align:center;">Check eligibility (free)</a>
          <a href="https://wa.me/9295419232" style="display:block; text-align:center; margin-top: var(--space-2); color: var(--text-secondary); font-size: 0.875rem;">Chat on WhatsApp</a>
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: var(--space-3); line-height:1.5;">No payment until eligibility confirmed. $50 deposit unlocks your case. Final invoice after document review.</p>
        </aside>
      </div>
    </section>
  </main>

  <div id="gfooter-placeholder"></div>
  <script src="js/nav-global.js" data-active-page="visa-umrah"></script>
</body>
</html>
```

- [ ] **Step 2: Manual smoke**

- [ ] **Step 3: Commit**

```bash
git add visa-umrah.html
git commit -m "feat(page): visa detail — Umrah"
```

---

### Task 9: `visa-family-visit.html` detail page

**Files:**
- Create: `visa-family-visit.html`

- [ ] **Step 1: Write the file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Saudi Family Visit Visa — GlobalHire@eLab</title>
  <meta name="description" content="Family Visit visa for Iqama-holders inviting spouse, children, or parents. Up to 90 days, extendable. From $210 all-in. Free eligibility check.">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/nav-global.css">
  <link rel="stylesheet" href="css/visa.css">
</head>
<body>
  <div class="page-bg" aria-hidden="true"></div>
  <div id="gnav-placeholder"></div>

  <main>
    <section class="container">
      <div class="visa-detail">
        <div class="visa-detail-content">
          <p class="label" style="opacity:.7;">Visas › Family › <strong>Family Visit Visa</strong></p>
          <h1>Saudi Family Visit Visa</h1>
          <p>For Iqama-holders inviting spouse, children, or parents to Saudi Arabia for up to 90 days (extendable).</p>

          <h2>What's included</h2>
          <ul>
            <li>MoFA application submitted by our licensed partner</li>
            <li>Document review &amp; sponsor verification</li>
            <li>WhatsApp + email status updates</li>
            <li>Visa PDF delivered to your dashboard</li>
          </ul>

          <h2>What you'll need</h2>
          <ul>
            <li>Visitor's passport bio page (valid 6+ months)</li>
            <li>Recent passport-style photo</li>
            <li>Sponsor's Iqama (front + back)</li>
            <li>Sponsor's salary certificate (recent, employer letterhead)</li>
            <li>Family relationship proof — marriage certificate, birth certificate, etc.</li>
          </ul>

          <h2>FAQ</h2>
          <p><strong>Processing:</strong> 7–14 working days from clean submission.</p>
          <p><strong>Stay:</strong> Up to 90 days, extendable in-country once.</p>
          <p><strong>Conversion to Iqama:</strong> Family Visit cannot be directly converted; you'd apply for Family Residence (a separate service we offer).</p>
          <p><strong>Refunds:</strong> $50 deposit refunded if ineligible at intake. Partner-side fees non-refundable after submission.</p>
        </div>

        <aside class="visa-price-card">
          <div class="from">From</div>
          <div class="price">$210</div>
          <div class="breakdown">Government fee $160 + ELAB service $50</div>
          <a class="visa-cta-primary" href="visa.html#wizard" style="display:block; text-align:center;">Check eligibility (free)</a>
          <a href="https://wa.me/9295419232" style="display:block; text-align:center; margin-top: var(--space-2); color: var(--text-secondary); font-size: 0.875rem;">Chat on WhatsApp</a>
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: var(--space-3); line-height:1.5;">No payment until eligibility confirmed. $50 deposit unlocks your case. Final invoice after document review.</p>
        </aside>
      </div>
    </section>
  </main>

  <div id="gfooter-placeholder"></div>
  <script src="js/nav-global.js" data-active-page="visa-family-visit"></script>
</body>
</html>
```

- [ ] **Step 2: Manual smoke**

- [ ] **Step 3: Commit**

```bash
git add visa-family-visit.html
git commit -m "feat(page): visa detail — Family Visit"
```

---

### Task 10: `visa-family-residence.html` detail page

**Files:**
- Create: `visa-family-residence.html`

- [ ] **Step 1: Write the file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Saudi Family Residence Visa — GlobalHire@eLab</title>
  <meta name="description" content="Family Residence (Iqama dependents) for spouse and children of Iqama-holders meeting income/profession criteria. From $320. Free eligibility check.">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/nav-global.css">
  <link rel="stylesheet" href="css/visa.css">
</head>
<body>
  <div class="page-bg" aria-hidden="true"></div>
  <div id="gnav-placeholder"></div>

  <main>
    <section class="container">
      <div class="visa-detail">
        <div class="visa-detail-content">
          <p class="label" style="opacity:.7;">Visas › Family › <strong>Family Residence Visa</strong></p>
          <h1>Saudi Family Residence Visa (Iqama Dependents)</h1>
          <p>Permanent dependent residency for spouse and children of an Iqama-holder who meets the income and profession criteria. Processed via MoFA + Jawazat.</p>

          <h2>What's included</h2>
          <ul>
            <li>MoFA + Jawazat application by our licensed partner</li>
            <li>Sponsor eligibility check (income, profession category)</li>
            <li>Document review</li>
            <li>WhatsApp + email status updates</li>
            <li>Visa PDF delivered to your dashboard</li>
          </ul>

          <h2>What you'll need</h2>
          <ul>
            <li>Each dependent's passport bio page (valid 6+ months)</li>
            <li>Recent passport-style photos</li>
            <li>Sponsor's Iqama (front + back)</li>
            <li>Sponsor's salary certificate (recent, employer letterhead)</li>
            <li>Sponsor's profession category (must be eligible)</li>
            <li>Marriage certificate (for spouse)</li>
            <li>Birth certificates (for children)</li>
          </ul>

          <h2>FAQ</h2>
          <p><strong>Processing:</strong> 4–8 weeks. Variable depending on sponsor's profession category and Jawazat workload.</p>
          <p><strong>Eligibility:</strong> Sponsor's profession must be on the Family Residence eligibility list (most healthcare professionals qualify). Our intake check confirms.</p>
          <p><strong>Pricing:</strong> Final price varies by number of dependents. From $320 covers one dependent; each additional dependent ~$120.</p>
          <p><strong>Refunds:</strong> $50 deposit refunded if ineligible at intake. Partner-side fees non-refundable after submission.</p>
        </div>

        <aside class="visa-price-card">
          <div class="from">From</div>
          <div class="price">$320</div>
          <div class="breakdown">One dependent · government + service fees</div>
          <a class="visa-cta-primary" href="visa.html#wizard" style="display:block; text-align:center;">Check eligibility (free)</a>
          <a href="https://wa.me/9295419232" style="display:block; text-align:center; margin-top: var(--space-2); color: var(--text-secondary); font-size: 0.875rem;">Chat on WhatsApp</a>
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: var(--space-3); line-height:1.5;">Final price depends on dependents &amp; sponsor docs. $50 deposit unlocks your case. Balance invoiced after document review.</p>
        </aside>
      </div>
    </section>
  </main>

  <div id="gfooter-placeholder"></div>
  <script src="js/nav-global.js" data-active-page="visa-family-residence"></script>
</body>
</html>
```

- [ ] **Step 2: Manual smoke**

- [ ] **Step 3: Commit**

```bash
git add visa-family-residence.html
git commit -m "feat(page): visa detail — Family Residence"
```

---

### Task 11: `visa-about.html` co-branding page

**Files:**
- Create: `visa-about.html`

- [ ] **Step 1: Write the file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About our Visa Services — GlobalHire@eLab</title>
  <meta name="description" content="ELAB Visa Services in partnership with our MoFA-licensed Saudi visa specialist. Licensed, regulated, and accountable.">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/nav-global.css">
  <link rel="stylesheet" href="css/visa.css">
</head>
<body>
  <div class="page-bg" aria-hidden="true"></div>
  <div id="gnav-placeholder"></div>

  <main>
    <section class="container" style="padding: var(--space-8) 0;">
      <h1>About our Visa Services</h1>
      <p style="max-width: 720px;">ELAB Visa Services helps individuals and families obtain Saudi Arabian visas — Tourist, Umrah, Family Visit, and Family Residence in our launch lineup, with more visa types arriving soon. Every application is submitted by our licensed Saudi visa partner; ELAB owns your end-to-end experience.</p>

      <h2>Our partner</h2>
      <div style="display: grid; grid-template-columns: auto 1fr; gap: var(--space-4); align-items: start; max-width: 720px; padding: var(--space-5); background: var(--bg-surface); border-radius: 10px; margin: var(--space-4) 0;">
        <div style="width: 80px; height: 80px; background: var(--bg-elevated); border-radius: 8px; display: grid; place-items: center; color: var(--text-secondary); font-size: 0.75rem;">[Logo]</div>
        <div>
          <p style="margin: 0;"><strong>[Partner Name]</strong></p>
          <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 4px 0;">MoFA Licence #[XXXX]</p>
          <p style="margin-top: var(--space-2);">[Partner bio paragraph — to be supplied by partner during onboarding. Should cover years in business, geographic coverage, key visa types, and any notable accreditations.]</p>
        </div>
      </div>

      <h2>How it works</h2>
      <ol style="max-width: 720px; line-height: 1.7;">
        <li>You complete the free eligibility check on our visa hub.</li>
        <li>If you're eligible, you sign up for a GlobalHire account and upload your documents.</li>
        <li>You pay a $50 deposit to start your case.</li>
        <li>Our intake team reviews your documents within 24 hours and either accepts them or asks for revisions.</li>
        <li>Once your file is clean, we submit it to our MoFA-licensed partner who processes the application with the Saudi authorities.</li>
        <li>You receive WhatsApp and email updates at every stage. When the visa is approved, you pay the balance and download your visa PDF from your dashboard.</li>
      </ol>

      <h2>Refund policy</h2>
      <p style="max-width: 720px;">If we determine you're ineligible at intake — before submitting to the partner — your $50 deposit is fully refundable. After submission, partner-side fees are non-refundable. If a visa is rejected by the Saudi authorities for reasons we did not flag, we refund the balance and retain only the deposit as our service fee.</p>

      <h2>Contact</h2>
      <p style="max-width: 720px;">WhatsApp: <a href="https://wa.me/9295419232" style="color: var(--primary-light);">+1 (929) 419-2327</a> · Email: <a href="mailto:visas@globalhire-elab.com" style="color: var(--primary-light);">visas@globalhire-elab.com</a></p>
    </section>
  </main>

  <div id="gfooter-placeholder"></div>
  <script src="js/nav-global.js" data-active-page="visa-about"></script>
</body>
</html>
```

- [ ] **Step 2: Manual smoke**

- [ ] **Step 3: Commit**

```bash
git add visa-about.html
git commit -m "feat(page): /visa/about — co-branding, partner identity, refund policy"
```

---

### Task 12: Playwright e2e — wizard happy path

**Files:**
- Create: `tests/visa-funnel.spec.js`

- [ ] **Step 1: Write the spec**

```javascript
// tests/visa-funnel.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Visa funnel', () => {

  test('hub renders with wizard chips and catalog', async ({ page }) => {
    await page.goto('/visa.html');
    await expect(page.locator('h1')).toContainText('Find your Saudi visa');
    const chips = page.locator('.visa-outcome-chip');
    await expect(chips).toHaveCount(9);
    const catalogCards = page.locator('.visa-catalog-card');
    await expect(catalogCards.first()).toBeVisible();
  });

  test('outcome → visa-tourist-evisa navigation', async ({ page }) => {
    await page.goto('/visa.html');
    await page.click('.visa-outcome-chip[data-outcome="visit-saudi"]');
    await page.waitForURL(/visa-tourist-evisa\.html/);
    await expect(page.locator('h1')).toContainText('Tourist eVisa');
  });

  test('outcome → visa-umrah navigation', async ({ page }) => {
    await page.goto('/visa.html');
    await page.click('.visa-outcome-chip[data-outcome="go-for-umrah"]');
    await page.waitForURL(/visa-umrah\.html/);
    await expect(page.locator('h1')).toContainText('Umrah');
  });

  test('outcome → visa-family-visit navigation', async ({ page }) => {
    await page.goto('/visa.html');
    await page.click('.visa-outcome-chip[data-outcome="bring-my-family"]');
    await page.waitForURL(/visa-family-visit\.html/);
    await expect(page.locator('h1')).toContainText('Family Visit');
  });

  test('coming-soon outcome shows WhatsApp deflection', async ({ page }) => {
    await page.goto('/visa.html');
    await page.click('.visa-outcome-chip[data-outcome="perform-hajj"]');
    const deflection = page.locator('#wizard-deflection');
    await expect(deflection).toBeVisible();
    await expect(deflection).toContainText('coming soon');
  });

  test('about page shows partner placeholder', async ({ page }) => {
    await page.goto('/visa-about.html');
    await expect(page.locator('h2')).toContainText('Our partner');
  });
});
```

- [ ] **Step 2: Run against deployed preview**

```bash
cd /Users/samuel/GLOBALHIRE@ELAB
npx playwright test tests/visa-funnel.spec.js
```

The Playwright config baseURL points at `https://globalhire-elab.vercel.app` — make sure all visa HTML files have been deployed (Vercel auto-deploys on push). Adjust baseURL temporarily if testing locally.

Expected: 6 specs pass.

- [ ] **Step 3: Commit**

```bash
git add tests/visa-funnel.spec.js
git commit -m "test(e2e): visa funnel happy path + coming-soon deflection"
```

---

## Self-Review Checklist

- [ ] Nav shows "Visas ▾" between Platform/About and Scholarships
- [ ] `/visa` hub: 9 chips, 9 catalog cards (4 active + 5 coming-soon), trust strip
- [ ] All 4 visa-detail pages render with two-column desktop layout collapsing to one column on mobile
- [ ] `/visa-about.html` partner placeholder is clearly placeholder, not fabricated
- [ ] `submit-visa-eligibility` and `check-visa-eligibility` deployed
- [ ] Anonymous wizard can complete from outcome chip → visa-detail page; lead row created in DB
- [ ] Playwright e2e passes against deployed preview

## What this plan does NOT do (deferred to Plan 3)

- No `/visa/start/:slug` intake form, no signup flow into the funnel
- No payment integration
- No candidate dashboard module
- No `start-visa-case` edge function (lead is created, but no `visa_cases` row yet)
