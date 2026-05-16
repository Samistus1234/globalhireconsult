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
