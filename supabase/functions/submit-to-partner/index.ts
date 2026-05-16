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
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', u.user.id).single();
  if (prof?.role !== 'admin') return new Response('admin only', { status: 403 });

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
