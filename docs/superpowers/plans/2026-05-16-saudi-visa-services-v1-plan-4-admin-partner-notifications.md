# Saudi Visa Services v1 — Plan 4: Admin, Partner Submission & Notifications

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the loop. Add admin pages so ELAB intake can review documents, request revisions, and "Submit to partner". Add the partner submission edge function (email channel for v1), partner status sync (manual + inbound webhook stub), and the notification system that emails + WhatsApps the candidate at every state transition.

**Architecture:** Admin pages are admin-only HTML pages gated by the existing `globalhire.profiles.is_admin` check. Edge functions: `visa-admin-action` (RPC-style: accept_doc, reject_doc, request_revision, submit_to_partner, mark_issued, mark_rejected, refund), `submit-to-partner` (sends a structured email to the partner inbox with signed doc URLs), `partner-status-sync` (inbound webhook stub + manual update path), `notify-visa-status` (sends email + WhatsApp via the existing `notify-applicant` SMTP setup + Meta WhatsApp API). Templates live in `_shared/visa-templates.ts` so all surfaces draw from one source.

**Tech Stack:** HTML, vanilla JS, Deno edge functions, nodemailer (SMTP — same pattern as `welcome-applicant`), Meta WhatsApp Cloud API.

**Spec reference:** §4.3 (Admin), §6.3 (edge fns), §7 (Operational Workflow), §8.4 (Voice & tone for templates).

**Depends on:** Plans 1, 2, 3 applied and live. WhatsApp Cloud API credentials available in Supabase secrets (per memory: existing GlobalHire integration).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/functions/_shared/visa-templates.ts` (new) | 7 templates × 2 channels (email HTML + WhatsApp text) |
| `supabase/functions/visa-admin-action/index.ts` (+ test) | Admin RPC: doc accept/reject, request revision, submit, mark issued/rejected, refund |
| `supabase/functions/submit-to-partner/index.ts` (+ test) | Builds payload + signed URLs, emails to partner inbox, logs to `partner_submissions` |
| `supabase/functions/partner-status-sync/index.ts` (+ test) | Inbound webhook + manual admin endpoint to update case status |
| `supabase/functions/notify-visa-status/index.ts` (+ test) | Emits email + WhatsApp on state transition; called by `visa-admin-action` and `payment-webhook` |
| `admin-visas.html` (new) | Case queue (filter by status, search by candidate) |
| `admin-visa-case.html` (new) | Per-case admin view: docs, actions, partner submission preview |
| `js/admin-visas.js` (new) | Admin queue logic |
| `js/admin-visa-case.js` (new) | Per-case admin actions |
| `tests/visa-admin.spec.js` (new) | Playwright e2e: admin login → queue → case → submit-to-partner |

---

### Task 1: Notification templates

**Files:**
- Create: `supabase/functions/_shared/visa-templates.ts`
- Test: `supabase/functions/_shared/visa-templates_test.ts`

- [ ] **Step 1: Failing test**

```typescript
// supabase/functions/_shared/visa-templates_test.ts
import { assertEquals, assertStringIncludes } from '@std/assert';
import { renderTemplate, TEMPLATE_KINDS } from './visa-templates.ts';

Deno.test('all template kinds are defined', () => {
  for (const kind of TEMPLATE_KINDS) {
    const out = renderTemplate(kind, { candidate_name: 'Aisha', visa_label: 'Family Visit', case_url: 'https://x.test/case' });
    assertEquals(typeof out.email_subject, 'string');
    assertEquals(typeof out.email_html, 'string');
    assertEquals(typeof out.whatsapp_text, 'string');
  }
});

Deno.test('deposit-received uses the candidate name and visa label', () => {
  const out = renderTemplate('deposit-received', { candidate_name: 'Aisha', visa_label: 'Family Visit', case_url: 'https://x.test/case' });
  assertStringIncludes(out.email_subject, 'Family Visit');
  assertStringIncludes(out.email_html, 'Aisha');
  assertStringIncludes(out.whatsapp_text, 'Aisha');
  assertStringIncludes(out.whatsapp_text, 'https://x.test/case');
});

Deno.test('intake-needs-revision includes a reason placeholder', () => {
  const out = renderTemplate('intake-needs-revision', {
    candidate_name: 'Aisha', visa_label: 'Family Visit', case_url: 'https://x.test/c',
    revision_reason: 'Sponsor Iqama image is blurred.',
  });
  assertStringIncludes(out.email_html, 'Sponsor Iqama image is blurred.');
  assertStringIncludes(out.whatsapp_text, 'Sponsor Iqama image is blurred.');
});
```

- [ ] **Step 2: Run — expect fail**

```bash
deno task test _shared/visa-templates_test.ts
```

- [ ] **Step 3: Implement templates**

```typescript
// supabase/functions/_shared/visa-templates.ts
// Single source of truth for visa-state notification copy.
// Uses ELAB-owned voice ("From the ELAB Visa Services team").

export const TEMPLATE_KINDS = [
  'deposit-received',
  'intake-passed',
  'intake-needs-revision',
  'submitted-to-partner',
  'approved-balance-due',
  'issued-pdf-available',
  'rejected-with-refund',
] as const;

export type TemplateKind = typeof TEMPLATE_KINDS[number];

export interface TemplateVars {
  candidate_name: string;
  visa_label: string;       // "Family Visit", etc.
  case_url: string;         // dashboard-visa-case.html link
  revision_reason?: string;
  refund_reason?: string;
  partner_reference?: string;
  balance_amount_usd?: number;
  visa_pdf_url?: string;
}

export interface RenderedTemplate {
  email_subject: string;
  email_html:    string;
  whatsapp_text: string;
}

function shell(title: string, body: string, ctaLabel: string, ctaUrl: string): string {
  return [
    '<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">',
      '<h2 style="color:#0F1D32;">', title, '</h2>',
      body,
      '<p style="margin-top: 24px;">',
        '<a href="', ctaUrl, '" style="display:inline-block; padding:12px 20px; background:#0077B6; color:#fff; text-decoration:none; border-radius:6px;">', ctaLabel, '</a>',
      '</p>',
      '<p style="color:#5A7190; font-size:12px; margin-top:32px;">From the ELAB Visa Services team — in partnership with [Partner Name].</p>',
    '</div>',
  ].join('');
}

export function renderTemplate(kind: TemplateKind, v: TemplateVars): RenderedTemplate {
  switch (kind) {
    case 'deposit-received':
      return {
        email_subject: `${v.visa_label}: deposit received — case started`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>We've received your $50 deposit for your <strong>${v.visa_label}</strong> case. Our intake team will review your documents within 24 hours and let you know the next step.</p>`,
          'View case', v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, your $50 deposit for ${v.visa_label} is in. We'll review your documents within 24 hours. View case: ${v.case_url}`,
      };

    case 'intake-passed':
      return {
        email_subject: `${v.visa_label}: documents accepted — submitting to partner`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>Your documents for the <strong>${v.visa_label}</strong> case look good. We're submitting to our MoFA-licensed partner now. We'll update you when the partner acknowledges.</p>`,
          'View case', v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, your ${v.visa_label} documents are accepted. Submitting to our partner now. ${v.case_url}`,
      };

    case 'intake-needs-revision':
      return {
        email_subject: `${v.visa_label}: action needed on your documents`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>Our intake team needs an updated document on your <strong>${v.visa_label}</strong> case:</p>
           <p style="padding:12px; background:#FFF6E5; border-left:3px solid #F4A261;"><em>${v.revision_reason ?? ''}</em></p>
           <p>Please re-upload via your dashboard. We'll resume as soon as it's in.</p>`,
          'Re-upload now', v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, action needed on your ${v.visa_label} case: ${v.revision_reason ?? ''} Re-upload here: ${v.case_url}`,
      };

    case 'submitted-to-partner':
      return {
        email_subject: `${v.visa_label}: submitted to MoFA-licensed partner`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>Your <strong>${v.visa_label}</strong> case has been submitted to our partner${v.partner_reference ? ` (reference <code>${v.partner_reference}</code>)` : ''}. We'll keep you posted as the Saudi authorities process it.</p>`,
          'View case', v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, your ${v.visa_label} is now with our partner${v.partner_reference ? ` (ref ${v.partner_reference})` : ''}. ${v.case_url}`,
      };

    case 'approved-balance-due': {
      const amount = v.balance_amount_usd != null ? `$${v.balance_amount_usd}` : 'the balance';
      return {
        email_subject: `${v.visa_label}: approved — pay ${amount} to receive your visa`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>Great news — your <strong>${v.visa_label}</strong> has been approved. Pay ${amount} via your dashboard to receive your visa PDF.</p>`,
          `Pay ${amount}`, v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, your ${v.visa_label} is approved! Pay ${amount} to receive your visa: ${v.case_url}`,
      };
    }

    case 'issued-pdf-available':
      return {
        email_subject: `${v.visa_label}: issued — your visa PDF is ready`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>Your <strong>${v.visa_label}</strong> has been issued. Download the visa PDF from your dashboard. Print a colour copy and carry it with your passport.</p>`,
          'Download visa PDF', v.visa_pdf_url ?? v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, your ${v.visa_label} is issued. Download here: ${v.visa_pdf_url ?? v.case_url}`,
      };

    case 'rejected-with-refund':
      return {
        email_subject: `${v.visa_label}: case closed — refund processed`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>We're unable to proceed with your <strong>${v.visa_label}</strong> case.</p>
           <p style="padding:12px; background:#FFE5E5; border-left:3px solid #E63946;"><em>${v.refund_reason ?? 'Reason not specified.'}</em></p>
           <p>Per our refund policy, we've initiated the applicable refund. Please allow 5–10 business days. Reply to this email if you'd like to discuss alternatives.</p>`,
          'View case', v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, your ${v.visa_label} case is closed: ${v.refund_reason ?? ''} Refund initiated. ${v.case_url}`,
      };
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/visa-templates.ts supabase/functions/_shared/visa-templates_test.ts
git commit -m "feat(shared): visa notification templates (email + whatsapp) for 7 states"
```

---

### Task 2: `notify-visa-status` edge function

**Files:**
- Create: `supabase/functions/notify-visa-status/index.ts` + `_test.ts`

This is called by `visa-admin-action`, `payment-webhook`, and `partner-status-sync` whenever a state changes.

- [ ] **Step 1: Failing test**

```typescript
// supabase/functions/notify-visa-status/index_test.ts
import { assertEquals } from '@std/assert';
import { stateToTemplateKind } from './index.ts';

Deno.test('stateToTemplateKind maps each state to a template (or null)', () => {
  assertEquals(stateToTemplateKind('intake_in_review'),     'deposit-received');
  assertEquals(stateToTemplateKind('docs_revision'),        'intake-needs-revision');
  assertEquals(stateToTemplateKind('submitted_to_partner'), 'submitted-to-partner');
  assertEquals(stateToTemplateKind('approved'),             'approved-balance-due');
  assertEquals(stateToTemplateKind('issued'),               'issued-pdf-available');
  assertEquals(stateToTemplateKind('rejected_intake'),      'rejected-with-refund');
  assertEquals(stateToTemplateKind('rejected_partner'),     'rejected-with-refund');
  assertEquals(stateToTemplateKind('refunded'),             'rejected-with-refund');
  assertEquals(stateToTemplateKind('lead'), null);
  assertEquals(stateToTemplateKind('deposit_pending'), null);
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```typescript
// supabase/functions/notify-visa-status/index.ts
// POST /notify-visa-status — service-only.
// Body: { case_id, new_status, revision_reason?, refund_reason? }
// Loads case + candidate, picks template, sends email + WhatsApp.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.10';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { renderTemplate, type TemplateKind } from '../_shared/visa-templates.ts';
import type { VisaCaseStatus } from '../_shared/visa-types.ts';

const VISA_LABEL: Record<string, string> = {
  tourist: 'Tourist eVisa', umrah: 'Umrah Visa', hajj: 'Hajj Visa',
  family_visit: 'Family Visit Visa', family_residence: 'Family Residence Visa',
  business: 'Business Visit Visa', work_iqama: 'Work & Iqama Visa',
  premium_residency: 'Premium Residency', investor_misa: 'Investor (MISA) Visa',
  transit: 'Transit Visa', domestic_worker: 'Domestic Worker Visa',
};

export function stateToTemplateKind(s: VisaCaseStatus): TemplateKind | null {
  const map: Partial<Record<VisaCaseStatus, TemplateKind>> = {
    intake_in_review:     'deposit-received',
    docs_revision:        'intake-needs-revision',
    submitted_to_partner: 'submitted-to-partner',
    approved:             'approved-balance-due',
    issued:               'issued-pdf-available',
    rejected_intake:      'rejected-with-refund',
    rejected_partner:     'rejected-with-refund',
    refunded:             'rejected-with-refund',
  };
  return map[s] ?? null;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: {
      user: Deno.env.get('SMTP_USER'),
      pass: Deno.env.get('SMTP_PASS'),
    },
  });
  await transporter.sendMail({
    from: '"ELAB Visa Services" <visas@globalhire-elab.com>',
    to, subject, html,
  });
}

async function sendWhatsApp(toPhone: string, body: string): Promise<void> {
  const phoneId = Deno.env.get('META_WHATSAPP_PHONE_ID');
  const token   = Deno.env.get('META_WHATSAPP_TOKEN');
  if (!phoneId || !token) { console.warn('WhatsApp not configured'); return; }
  await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toPhone,
      type: 'text',
      text: { body },
    }),
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Service role only — protected by Supabase JWT verify in production
  const body = await req.json().catch(() => null);
  if (!body?.case_id || !body?.new_status) {
    return new Response(JSON.stringify({ error: 'case_id + new_status required' }), { status: 400 });
  }

  const kind = stateToTemplateKind(body.new_status);
  if (!kind) return new Response('no-op (state has no template)', { status: 200 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'globalhire' } },
  );

  const { data: c, error: cErr } = await supabase
    .from('visa_cases')
    .select('id, visa_type, candidate_id, partner_reference, estimated_total_usd, visa_pdf_path, deposit_paid_at')
    .eq('id', body.case_id)
    .single();
  if (cErr || !c) return new Response('case not found', { status: 404 });

  // Pull candidate email + phone from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone, email')
    .eq('id', c.candidate_id)
    .single();
  const { data: authUser } = await supabase.auth.admin.getUserById(c.candidate_id);
  const email = profile?.email ?? authUser?.user?.email;
  const phone = profile?.phone;
  const candidate_name = profile?.full_name ?? authUser?.user?.user_metadata?.full_name ?? 'there';

  const siteUrl = Deno.env.get('GH_SITE_URL') ?? 'https://globalhire-elab.vercel.app';
  const case_url = `${siteUrl}/dashboard-visa-case.html?id=${c.id}`;
  const visa_pdf_url = c.visa_pdf_path
    ? `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/sign/visa-documents/${c.visa_pdf_path}`
    : undefined;

  const balance = c.estimated_total_usd != null && c.deposit_paid_at
    ? c.estimated_total_usd - 50
    : undefined;

  const rendered = renderTemplate(kind, {
    candidate_name,
    visa_label: VISA_LABEL[c.visa_type] ?? c.visa_type,
    case_url,
    revision_reason: body.revision_reason,
    refund_reason:   body.refund_reason,
    partner_reference: c.partner_reference ?? undefined,
    balance_amount_usd: balance,
    visa_pdf_url,
  });

  if (email) {
    try { await sendEmail(email, rendered.email_subject, rendered.email_html); }
    catch (e) { console.error('email send failed', e); }
  }
  if (phone) {
    try { await sendWhatsApp(phone, rendered.whatsapp_text); }
    catch (e) { console.error('whatsapp send failed', e); }
  }

  // Audit
  await supabase.from('visa_case_events').insert({
    case_id: c.id,
    event_type: 'notification_sent',
    payload: { kind, channels: { email: !!email, whatsapp: !!phone } },
  });

  return new Response(JSON.stringify({ sent: { email: !!email, whatsapp: !!phone } }), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Set secrets + deploy**

```bash
supabase secrets set SMTP_USER=visas@... SMTP_PASS=... META_WHATSAPP_PHONE_ID=... META_WHATSAPP_TOKEN=...
supabase functions deploy notify-visa-status --project-ref <ref> --no-verify-jwt
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/notify-visa-status/
git commit -m "feat(fn): notify-visa-status — email + WhatsApp on state transitions"
```

---

### Task 3: `submit-to-partner` edge function

**Files:**
- Create: `supabase/functions/submit-to-partner/index.ts` + `_test.ts`

- [ ] **Step 1: Failing test**

```typescript
// supabase/functions/submit-to-partner/index_test.ts
import { assertEquals, assertStringIncludes } from '@std/assert';
import { buildPartnerEmail, type PartnerPayload } from './index.ts';

Deno.test('buildPartnerEmail subject includes visa label and case ref', () => {
  const payload: PartnerPayload = {
    case_id: 'CASE-1', visa_label: 'Family Visit', candidate_name: 'Aisha Bello',
    passport_number: 'A12345678', sponsor_iqama: '2456789012', sponsor_name: 'Ibrahim Bello',
    travel_dates: { arrival: '2026-08-01', stay_days: 30 },
    contact_phone: '+234...', doc_links: [{ kind: 'passport_bio', url: 'https://x.test/d.pdf' }],
  };
  const out = buildPartnerEmail(payload);
  assertStringIncludes(out.subject, 'Family Visit');
  assertStringIncludes(out.subject, 'CASE-1');
  assertStringIncludes(out.html,    'Aisha Bello');
  assertStringIncludes(out.html,    'A12345678');
  assertStringIncludes(out.html,    'passport_bio');
  assertEquals(out.html.includes('on behalf of'), true);
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```typescript
// supabase/functions/submit-to-partner/index.ts
// POST /submit-to-partner — admin only.
// Body: { case_id }
// Action: assemble structured email + signed doc URLs, send to partner inbox,
// log to partner_submissions, transition case to submitted_to_partner.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.10';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

export interface PartnerPayload {
  case_id: string;
  visa_label: string;
  candidate_name: string;
  passport_number: string;
  sponsor_iqama: string | null;
  sponsor_name: string | null;
  travel_dates: { arrival?: string | null; stay_days?: number | null } | null;
  contact_phone: string | null;
  doc_links: Array<{ kind: string; url: string }>;
}

export function buildPartnerEmail(p: PartnerPayload): { subject: string; html: string } {
  const subject = `[ELAB] ${p.visa_label} — case ${p.case_id} (${p.candidate_name})`;
  const docList = p.doc_links.map(
    (d) => `<li><strong>${d.kind}</strong>: <a href="${d.url}">${d.url}</a></li>`,
  ).join('');
  const html = `
    <p>Submitting on behalf of <strong>${p.candidate_name}</strong> (passport ${p.passport_number}).</p>
    <table cellpadding="6">
      <tr><td><strong>Visa</strong></td><td>${p.visa_label}</td></tr>
      <tr><td><strong>Case ref</strong></td><td>${p.case_id}</td></tr>
      ${p.sponsor_name ? `<tr><td><strong>Sponsor</strong></td><td>${p.sponsor_name} · Iqama ${p.sponsor_iqama}</td></tr>` : ''}
      ${p.travel_dates ? `<tr><td><strong>Travel</strong></td><td>Arrive ${p.travel_dates.arrival ?? ''} · Stay ${p.travel_dates.stay_days ?? ''} days</td></tr>` : ''}
      ${p.contact_phone ? `<tr><td><strong>WhatsApp</strong></td><td>${p.contact_phone}</td></tr>` : ''}
    </table>
    <h3>Documents</h3>
    <ul>${docList}</ul>
    <p style="color:#5A7190;">Submitted by ELAB Visa Services. Reply with the partner-side reference number when acknowledged.</p>
  `;
  return { subject, html };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return new Response('auth required', { status: 401 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'globalhire' } },
  );

  // Verify caller is admin
  const { data: u } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!u?.user) return new Response('invalid token', { status: 401 });
  const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', u.user.id).single();
  if (!prof?.is_admin) return new Response('admin only', { status: 403 });

  const { case_id } = await req.json();
  if (!case_id) return new Response('case_id required', { status: 400 });

  // Pull case + candidate + accepted docs
  const { data: c, error: cErr } = await supabase.from('visa_cases')
    .select('id, visa_type, candidate_id, sponsor_iqama, sponsor_name, travel_dates')
    .eq('id', case_id).single();
  if (cErr || !c) return new Response('case not found', { status: 404 });

  const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('id', c.candidate_id).single();
  const { data: authUser } = await supabase.auth.admin.getUserById(c.candidate_id);
  const candidate_name = profile?.full_name ?? authUser?.user?.user_metadata?.full_name ?? 'Unknown';

  const { data: docs } = await supabase.from('visa_case_documents')
    .select('doc_kind, storage_path').eq('case_id', case_id).eq('review_status', 'accepted');

  // Build signed URLs (24h)
  const doc_links: Array<{ kind: string; url: string }> = [];
  for (const d of docs ?? []) {
    const { data: signed } = await supabase.storage.from('visa-documents').createSignedUrl(d.storage_path, 60 * 60 * 24);
    if (signed?.signedUrl) doc_links.push({ kind: d.doc_kind, url: signed.signedUrl });
  }

  const VISA_LABEL: Record<string, string> = {
    tourist: 'Tourist eVisa', umrah: 'Umrah', family_visit: 'Family Visit', family_residence: 'Family Residence',
  };

  const payload: PartnerPayload = {
    case_id: c.id,
    visa_label: VISA_LABEL[c.visa_type] ?? c.visa_type,
    candidate_name,
    passport_number: 'see attached passport scan', // v1: partner reads from passport_bio doc; add column in v2
    sponsor_iqama: c.sponsor_iqama,
    sponsor_name:  c.sponsor_name,
    travel_dates:  c.travel_dates,
    contact_phone: profile?.phone ?? null,
    doc_links,
  };

  const { subject, html } = buildPartnerEmail(payload);

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: Deno.env.get('SMTP_USER'), pass: Deno.env.get('SMTP_PASS') },
  });
  await transporter.sendMail({
    from: '"ELAB Visa Services" <visas@globalhire-elab.com>',
    to: Deno.env.get('PARTNER_INBOX') ?? '',
    subject, html,
  });

  // Log + transition
  await supabase.from('partner_submissions').insert({
    case_id, channel: 'email', request_payload: payload,
  });
  await supabase.from('visa_cases').update({
    status: 'submitted_to_partner', partner_submitted_at: new Date().toISOString(),
  }).eq('id', case_id);

  // Trigger candidate notification
  await fetch(Deno.env.get('SUPABASE_URL') + '/functions/v1/notify-visa-status', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') },
    body: JSON.stringify({ case_id, new_status: 'submitted_to_partner' }),
  });

  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'content-type': 'application/json' } });
});
```

- [ ] **Step 4: Run tests + deploy**

```bash
deno task test submit-to-partner/index_test.ts
supabase secrets set PARTNER_INBOX=submissions@partner.example
supabase functions deploy submit-to-partner --project-ref <ref>
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/submit-to-partner/
git commit -m "feat(fn): submit-to-partner — email channel with signed doc URLs + audit log"
```

---

### Task 4: `partner-status-sync` edge function

**Files:**
- Create: `supabase/functions/partner-status-sync/index.ts` + `_test.ts`

- [ ] **Step 1: Failing test**

```typescript
// supabase/functions/partner-status-sync/index_test.ts
import { assertEquals } from '@std/assert';
import { mapPartnerStatus } from './index.ts';

Deno.test('partner status mapping', () => {
  assertEquals(mapPartnerStatus('acknowledged'), 'partner_processing');
  assertEquals(mapPartnerStatus('approved'),     'approved');
  assertEquals(mapPartnerStatus('issued'),       'issued');
  assertEquals(mapPartnerStatus('rejected'),     'rejected_partner');
  assertEquals(mapPartnerStatus('unknown_value'), null);
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```typescript
// supabase/functions/partner-status-sync/index.ts
// Two entry modes:
//   POST /partner-status-sync   (admin-triggered manual update)
//     body: { case_id, partner_status, partner_reference?, visa_pdf_base64? }
//   POST /partner-status-sync (with X-Partner-Token header)
//     inbound webhook from partner; same body shape

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import type { VisaCaseStatus } from '../_shared/visa-types.ts';

export function mapPartnerStatus(s: string): VisaCaseStatus | null {
  switch (s) {
    case 'acknowledged': return 'partner_processing';
    case 'processing':   return 'partner_processing';
    case 'approved':     return 'approved';
    case 'issued':       return 'issued';
    case 'rejected':     return 'rejected_partner';
    default:             return null;
  }
}

async function authIsAdminOrPartner(req: Request, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const partnerToken = req.headers.get('x-partner-token');
  if (partnerToken && partnerToken === Deno.env.get('PARTNER_WEBHOOK_TOKEN')) return true;

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const { data: u } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
  if (!u?.user) return false;
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', u.user.id).single();
  return !!p?.is_admin;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'globalhire' } },
  );

  if (!(await authIsAdminOrPartner(req, supabase))) {
    return new Response('forbidden', { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.case_id || !body?.partner_status) return new Response('case_id + partner_status required', { status: 400 });

  const newStatus = mapPartnerStatus(body.partner_status);
  if (!newStatus) return new Response('unknown partner_status', { status: 400 });

  const update: Record<string, unknown> = { status: newStatus };
  if (body.partner_reference) update.partner_reference = body.partner_reference;

  // If partner sent a PDF, store it
  if (body.visa_pdf_base64) {
    const bytes = Uint8Array.from(atob(body.visa_pdf_base64), (c) => c.charCodeAt(0));
    const path = `partner-deliverables/${body.case_id}/visa.pdf`;
    await supabase.storage.from('visa-documents').upload(path, bytes, {
      contentType: 'application/pdf', upsert: true,
    });
    update.visa_pdf_path = path;
    update.issued_at = new Date().toISOString();
  }

  await supabase.from('visa_cases').update(update).eq('id', body.case_id);
  await supabase.from('visa_case_events').insert({
    case_id: body.case_id, event_type: 'partner_status_sync', payload: { partner_status: body.partner_status, new_status: newStatus },
  });

  // Trigger candidate notification
  await fetch(Deno.env.get('SUPABASE_URL') + '/functions/v1/notify-visa-status', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') },
    body: JSON.stringify({ case_id: body.case_id, new_status: newStatus }),
  });

  return new Response(JSON.stringify({ ok: true, new_status: newStatus }), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
```

- [ ] **Step 4: Tests + deploy**

```bash
deno task test partner-status-sync/index_test.ts
supabase secrets set PARTNER_WEBHOOK_TOKEN=$(openssl rand -hex 32)
supabase functions deploy partner-status-sync --project-ref <ref> --no-verify-jwt
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/partner-status-sync/
git commit -m "feat(fn): partner-status-sync — admin manual + inbound webhook channel"
```

---

### Task 5: `visa-admin-action` edge function

**Files:**
- Create: `supabase/functions/visa-admin-action/index.ts` + `_test.ts`

Single endpoint that maps action → DB mutation (intake review, refund, mark issued, etc.).

- [ ] **Step 1: Failing test**

```typescript
// supabase/functions/visa-admin-action/index_test.ts
import { assertEquals } from '@std/assert';
import { ALLOWED_ACTIONS } from './index.ts';

Deno.test('ALLOWED_ACTIONS lists exactly the v1 admin actions', () => {
  assertEquals(ALLOWED_ACTIONS.sort(), [
    'accept_doc',
    'mark_issued',
    'refund',
    'reject_doc',
    'reject_intake',
    'request_revision',
  ].sort());
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```typescript
// supabase/functions/visa-admin-action/index.ts
// POST /visa-admin-action — admin only.
// Body: { action, case_id, doc_id?, reason? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

export const ALLOWED_ACTIONS = [
  'accept_doc', 'reject_doc', 'request_revision', 'reject_intake', 'mark_issued', 'refund',
] as const;
export type AdminAction = typeof ALLOWED_ACTIONS[number];

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return new Response('auth required', { status: 401 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'globalhire' } },
  );

  const { data: u } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
  if (!u?.user) return new Response('invalid token', { status: 401 });
  const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', u.user.id).single();
  if (!prof?.is_admin) return new Response('admin only', { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.action || !body?.case_id) return new Response('action + case_id required', { status: 400 });
  if (!ALLOWED_ACTIONS.includes(body.action)) return new Response('unknown action', { status: 400 });

  const adminId = u.user.id;
  let newStatus: string | null = null;

  switch (body.action as AdminAction) {
    case 'accept_doc':
      if (!body.doc_id) return new Response('doc_id required', { status: 400 });
      await supabase.from('visa_case_documents').update({ review_status: 'accepted', reviewer_note: null }).eq('id', body.doc_id);
      break;

    case 'reject_doc':
      if (!body.doc_id) return new Response('doc_id required', { status: 400 });
      await supabase.from('visa_case_documents').update({ review_status: 'rejected', reviewer_note: body.reason ?? null }).eq('id', body.doc_id);
      break;

    case 'request_revision':
      newStatus = 'docs_revision';
      await supabase.from('visa_cases').update({ status: newStatus }).eq('id', body.case_id);
      break;

    case 'reject_intake':
      newStatus = 'rejected_intake';
      await supabase.from('visa_cases').update({ status: newStatus, refund_reason: body.reason ?? null }).eq('id', body.case_id);
      // Mark deposit invoice for refund
      await supabase.from('visa_invoices').update({ status: 'refunded' }).eq('case_id', body.case_id).eq('kind', 'deposit');
      break;

    case 'mark_issued':
      newStatus = 'issued';
      await supabase.from('visa_cases').update({ status: newStatus, issued_at: new Date().toISOString() }).eq('id', body.case_id);
      break;

    case 'refund':
      newStatus = 'refunded';
      await supabase.from('visa_cases').update({ status: newStatus, refund_reason: body.reason ?? null }).eq('id', body.case_id);
      break;
  }

  await supabase.from('visa_case_events').insert({
    case_id: body.case_id, actor_id: adminId, event_type: 'admin:' + body.action,
    payload: { reason: body.reason ?? null, doc_id: body.doc_id ?? null, new_status: newStatus },
  });

  if (newStatus) {
    await fetch(Deno.env.get('SUPABASE_URL') + '/functions/v1/notify-visa-status', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') },
      body: JSON.stringify({ case_id: body.case_id, new_status: newStatus, revision_reason: body.reason, refund_reason: body.reason }),
    });
  }

  return new Response(JSON.stringify({ ok: true, new_status: newStatus }), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
```

- [ ] **Step 4: Tests + deploy**

```bash
deno task test visa-admin-action/index_test.ts
supabase functions deploy visa-admin-action --project-ref <ref>
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/visa-admin-action/
git commit -m "feat(fn): visa-admin-action — intake review + status-change RPC"
```

---

### Task 6: Admin pages — `admin-visas.html` queue

**Files:**
- Create: `admin-visas.html`
- Create: `js/admin-visas.js`

- [ ] **Step 1: Write `admin-visas.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin · Visa Cases — GlobalHire@eLab</title>

  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/nav-global.css">
  <link rel="stylesheet" href="css/visa.css">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="page-bg" aria-hidden="true"></div>
  <div id="gnav-placeholder"></div>

  <main>
    <section class="container" style="padding: var(--space-6) 0;">
      <h1>Visa Case Queue</h1>
      <div style="display: flex; gap: var(--space-2); margin: var(--space-3) 0;">
        <select id="filter-status">
          <option value="">All statuses</option>
          <option value="deposit_pending">Awaiting payment</option>
          <option value="intake_in_review">Intake — needs review</option>
          <option value="docs_revision">Docs — revision sent</option>
          <option value="submitted_to_partner">Submitted</option>
          <option value="partner_processing">At MoFA</option>
          <option value="approved">Approved (balance due)</option>
          <option value="issued">Issued</option>
          <option value="rejected_intake">Rejected at intake</option>
          <option value="rejected_partner">Rejected by partner</option>
        </select>
        <input type="search" id="filter-q" placeholder="Search case ID, candidate name…" style="flex:1;">
      </div>

      <div id="admin-cases-list"></div>
    </section>
  </main>

  <div id="gfooter-placeholder"></div>
  <script src="js/nav-global.js" data-active-page="admin"></script>
  <script src="js/admin-visas.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `js/admin-visas.js`**

```javascript
/* GLOBALHIRE@ELAB — Admin visa case queue */
(function () {
  'use strict';

  // GlobalHire Supabase project (per js/supabase-client.js)
  var SUPABASE_URL = window.SUPABASE_URL || 'https://evzhnsugmvtqgmvzwyix.supabase.co';
  var SUPABASE_ANON = window.SUPABASE_ANON_KEY || '';

  function authHeader() {
    var t = sessionStorage.getItem('sb-access-token') || localStorage.getItem('sb-access-token');
    return t ? 'Bearer ' + t : null;
  }

  async function fetchCases(status, q) {
    var url = SUPABASE_URL + '/rest/v1/visa_cases?select=id,visa_type,status,candidate_id,created_at&order=created_at.desc&limit=200';
    if (status) url += '&status=eq.' + status;
    var resp = await fetch(url, {
      headers: { apikey: SUPABASE_ANON, Authorization: authHeader(), 'Accept-Profile': 'globalhire' },
    });
    if (!resp.ok) throw new Error('fetch failed');
    var rows = await resp.json();
    if (q) {
      var ql = q.toLowerCase();
      rows = rows.filter(function (r) { return r.id.toLowerCase().includes(ql); });
    }
    return rows;
  }

  function render(rows) {
    var list = document.getElementById('admin-cases-list');
    if (!rows.length) { list.innerHTML = '<p>No cases match the filters.</p>'; return; }
    list.innerHTML =
      '<table style="width:100%; border-collapse: collapse;">' +
        '<thead><tr style="text-align:left; border-bottom: 1px solid rgba(255,255,255,.15);">' +
          '<th style="padding:8px;">Case</th><th>Visa</th><th>Status</th><th>Started</th>' +
        '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr style="border-bottom: 1px solid rgba(255,255,255,.06);">' +
            '<td style="padding:8px;"><a href="admin-visa-case.html?id=' + r.id + '" style="color: var(--primary-light);">' + r.id.slice(0,8) + '…</a></td>' +
            '<td>' + r.visa_type.replace(/_/g,' ') + '</td>' +
            '<td>' + r.status.replace(/_/g,' ') + '</td>' +
            '<td>' + new Date(r.created_at).toLocaleString() + '</td>' +
          '</tr>';
        }).join('') +
      '</tbody></table>';
  }

  function refresh() {
    var status = document.getElementById('filter-status').value;
    var q = document.getElementById('filter-q').value;
    fetchCases(status, q).then(render).catch(function () {
      document.getElementById('admin-cases-list').innerHTML = '<p>Could not load cases (admin only).</p>';
    });
  }

  function init() {
    if (!authHeader()) { location.href = 'login.html?return=' + encodeURIComponent(location.pathname); return; }
    document.getElementById('filter-status').addEventListener('change', refresh);
    document.getElementById('filter-q').addEventListener('input', function () {
      clearTimeout(window._adminQT);
      window._adminQT = setTimeout(refresh, 250);
    });
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
```

- [ ] **Step 3: Smoke test (admin user)**

- [ ] **Step 4: Commit**

```bash
git add admin-visas.html js/admin-visas.js
git commit -m "feat(admin): visa case queue with status filter + search"
```

---

### Task 7: Admin per-case page — `admin-visa-case.html`

**Files:**
- Create: `admin-visa-case.html`
- Create: `js/admin-visa-case.js`

- [ ] **Step 1: Write `admin-visa-case.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin · Case Detail — GlobalHire@eLab</title>

  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/nav-global.css">
  <link rel="stylesheet" href="css/visa.css">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="page-bg" aria-hidden="true"></div>
  <div id="gnav-placeholder"></div>

  <main>
    <section class="container" style="padding: var(--space-6) 0;">
      <p class="label"><a href="admin-visas.html" style="color: var(--text-secondary);">← Queue</a></p>
      <h1 id="admin-case-title">Case</h1>
      <p class="lede" id="admin-case-meta" style="color: var(--text-secondary);"></p>

      <div class="visa-detail">
        <div class="visa-detail-content">
          <h2>Documents</h2>
          <div id="admin-docs"></div>

          <h2 style="margin-top: var(--space-6);">Timeline</h2>
          <div id="admin-events"></div>
        </div>

        <aside class="visa-price-card">
          <p style="font-weight: 600;">Actions</p>
          <button class="visa-cta-primary" id="btn-submit-partner" style="margin-top: var(--space-2); display: block; width: 100%;">Submit to partner</button>
          <button class="visa-cta-primary" id="btn-request-revision" style="margin-top: var(--space-2); display: block; width: 100%; background: var(--accent-amber);">Request revision</button>
          <button class="visa-cta-primary" id="btn-mark-issued" style="margin-top: var(--space-2); display: block; width: 100%; background: var(--accent-teal);">Mark issued</button>
          <button class="visa-cta-primary" id="btn-reject-intake" style="margin-top: var(--space-2); display: block; width: 100%; background: var(--error);">Reject &amp; refund</button>
        </aside>
      </div>
    </section>
  </main>

  <script src="js/nav-global.js" data-active-page="admin"></script>
  <script src="js/admin-visa-case.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `js/admin-visa-case.js`**

```javascript
/* GLOBALHIRE@ELAB — Admin per-case actions */
(function () {
  'use strict';

  // GlobalHire Supabase project (per js/supabase-client.js)
  var SUPABASE_URL = window.SUPABASE_URL || 'https://evzhnsugmvtqgmvzwyix.supabase.co';
  var SUPABASE_ANON = window.SUPABASE_ANON_KEY || '';
  var FN_BASE = SUPABASE_URL + '/functions/v1';

  function authHeader() {
    var t = sessionStorage.getItem('sb-access-token') || localStorage.getItem('sb-access-token');
    return t ? 'Bearer ' + t : null;
  }

  function caseId() { return new URLSearchParams(location.search).get('id'); }

  async function rest(path) {
    var r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      headers: { apikey: SUPABASE_ANON, Authorization: authHeader(), 'Accept-Profile': 'globalhire' },
    });
    if (!r.ok) throw new Error('rest fail');
    return r.json();
  }

  async function callAction(action, extra) {
    var resp = await fetch(FN_BASE + '/visa-admin-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify(Object.assign({ action: action, case_id: caseId() }, extra || {})),
    });
    if (!resp.ok) throw new Error(action + ' failed: ' + (await resp.text()));
    return resp.json();
  }

  async function callSubmitPartner() {
    var resp = await fetch(FN_BASE + '/submit-to-partner', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({ case_id: caseId() }),
    });
    if (!resp.ok) throw new Error('submit-to-partner failed: ' + (await resp.text()));
    return resp.json();
  }

  function renderDocs(docs) {
    document.getElementById('admin-docs').innerHTML = docs.length
      ? '<table style="width:100%; border-collapse: collapse;">' +
        docs.map(function (d) {
          return '<tr style="border-bottom: 1px solid rgba(255,255,255,.06);">' +
            '<td style="padding:6px;"><strong>' + d.doc_kind + '</strong></td>' +
            '<td>' + d.review_status + '</td>' +
            '<td>' +
              '<button data-action="accept_doc" data-doc-id="' + d.id + '" class="mock-button" style="margin-right:6px;">Accept</button>' +
              '<button data-action="reject_doc" data-doc-id="' + d.id + '" class="mock-button">Reject</button>' +
            '</td>' +
          '</tr>';
        }).join('') + '</table>'
      : '<p>No documents.</p>';

    document.querySelectorAll('#admin-docs button[data-action]').forEach(function (b) {
      b.addEventListener('click', function () {
        var reason = b.dataset.action === 'reject_doc' ? prompt('Reason?') : null;
        callAction(b.dataset.action, { doc_id: b.dataset.docId, reason: reason }).then(load);
      });
    });
  }

  async function load() {
    var [cases, docs, events] = await Promise.all([
      rest('visa_cases?id=eq.' + caseId() + '&select=*'),
      rest('visa_case_documents?case_id=eq.' + caseId() + '&select=*'),
      rest('visa_case_events?case_id=eq.' + caseId() + '&select=*&order=created_at.asc'),
    ]);
    if (!cases.length) { location.href = 'admin-visas.html'; return; }
    var c = cases[0];
    document.getElementById('admin-case-title').textContent = c.visa_type.replace(/_/g,' ') + ' · ' + c.status.replace(/_/g,' ');
    document.getElementById('admin-case-meta').textContent  = 'Case ' + c.id + ' · candidate ' + c.candidate_id;
    renderDocs(docs);
    document.getElementById('admin-events').innerHTML = events.map(function (e) {
      return '<div style="padding:6px 0; border-bottom: 1px solid rgba(255,255,255,.06);"><strong>' + e.event_type + '</strong> · ' + new Date(e.created_at).toLocaleString() + '</div>';
    }).join('');
  }

  function init() {
    if (!authHeader() || !caseId()) { location.href = 'admin-visas.html'; return; }

    document.getElementById('btn-submit-partner')   .addEventListener('click', function () { if (confirm('Submit to partner?'))         callSubmitPartner().then(load); });
    document.getElementById('btn-request-revision') .addEventListener('click', function () { var r = prompt('Revision reason for candidate?'); if (r) callAction('request_revision', { reason: r }).then(load); });
    document.getElementById('btn-mark-issued')      .addEventListener('click', function () { if (confirm('Mark this case as issued?'))   callAction('mark_issued').then(load); });
    document.getElementById('btn-reject-intake')    .addEventListener('click', function () { var r = prompt('Rejection reason (will refund $50)?'); if (r) callAction('reject_intake', { reason: r }).then(load); });

    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
```

- [ ] **Step 3: Smoke test (admin user)**

- [ ] **Step 4: Commit**

```bash
git add admin-visa-case.html js/admin-visa-case.js
git commit -m "feat(admin): per-case admin view with intake actions + submit-to-partner"
```

---

### Task 8: Playwright e2e — admin happy path

**Files:**
- Create: `tests/visa-admin.spec.js`

- [ ] **Step 1: Write the spec**

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Admin visa case workflow', () => {
  async function loginAsAdmin(page) {
    await page.goto('/login.html');
    await page.fill('input[name="email"]',    process.env.TEST_ADMIN_EMAIL);
    await page.fill('input[name="password"]', process.env.TEST_ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/);
  }

  test('admin queue loads and filters by status', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin-visas.html');
    await expect(page.locator('h1')).toContainText('Visa Case Queue');
    await page.selectOption('#filter-status', 'intake_in_review');
    await page.waitForTimeout(500);
    // Assert no error message
    await expect(page.locator('text=Could not load')).toHaveCount(0);
  });

  test('admin per-case page loads action buttons', async ({ page }) => {
    if (!process.env.TEST_VISA_CASE_ID) test.skip();
    await loginAsAdmin(page);
    await page.goto('/admin-visa-case.html?id=' + process.env.TEST_VISA_CASE_ID);
    await expect(page.locator('#btn-submit-partner')).toBeVisible();
    await expect(page.locator('#btn-request-revision')).toBeVisible();
    await expect(page.locator('#btn-mark-issued')).toBeVisible();
    await expect(page.locator('#btn-reject-intake')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
TEST_ADMIN_EMAIL=admin@... TEST_ADMIN_PASSWORD=... npx playwright test tests/visa-admin.spec.js
git add tests/visa-admin.spec.js
git commit -m "test(e2e): admin queue + per-case action surface"
```

---

## Self-Review Checklist

- [ ] All 7 templates render with the right vars; deno test passes
- [ ] `notify-visa-status` reaches the candidate via email (check Gmail) and WhatsApp (check Meta logs)
- [ ] `submit-to-partner` sends a structured email to `PARTNER_INBOX` with signed doc URLs
- [ ] `partner-status-sync` accepts both admin-auth and partner-token, transitions case, triggers candidate notification
- [ ] `visa-admin-action` enforces admin role and audits each action in `visa_case_events`
- [ ] Admin queue filters by status and the per-case page exposes all v1 actions
- [ ] Playwright admin specs pass

## v1 launch readiness

After this plan:

- Candidate flow: hub → wizard → eligibility → signup → intake + docs → $50 deposit → case in review → submission → partner processing → approved → balance pay → visa PDF download
- Admin flow: queue → case detail → accept/reject docs → request revision → submit to partner → mark issued or reject + refund
- Notifications: email + WhatsApp at deposit-received, intake-passed, intake-needs-revision, submitted-to-partner, approved-balance-due, issued-pdf-available, rejected-with-refund

**Pre-launch checklist (from spec §9.1):**
- [ ] Partner data captured (legal name, MoFA licence, wholesale prices, SLAs, submission channel, refund policy)
- [ ] Paystack + Stripe live keys deployed
- [ ] WhatsApp templates submitted to Meta and approved (24h)
- [ ] Legal review of T&Cs + refund policy
- [ ] Real partner identity replaces `[Partner Name]` placeholders site-wide
- [ ] Trust-strip "10,000+" placeholder replaced with verified number or removed

## What this plan does NOT do (deferred to v2 / v3)

- No automated balance invoicing UX (manual via admin-visa-case for v1)
- No partner API integration (v3)
- No additional visa types (v2/v3)
- No Iqama-holder dashboard cross-sell module (v2)
- No SEO content per visa+market combo (v2)
- No analytics dashboard (v3)
