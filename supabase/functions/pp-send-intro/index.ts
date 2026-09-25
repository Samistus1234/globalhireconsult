import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.10';
import { escapeHtml, headerSafe } from '../_shared/mail-security.ts';

/*
  pp-send-intro — send the partner-intro email to a placement partner.

  Body: { partner_id, to, subject, body_text, attach_codes?: string[], cc?: string }
  - Admin only (globalhire.profiles.role = 'admin').
  - Attaches the partner-pack PDFs whose code is in attach_codes (defaults to
    attach_by_default rows with status 'current').
  - On success inserts a placement_partner_outreach row (channel email,
    status_after 'contacted' unless the partner is already further along) — the
    v43 trigger moves the partner's status + last_contact_at.
  - Mailer: Gmail SMTP, same env as mp-agency-verify (GMAIL_USER/GMAIL_APP_PASSWORD).
*/

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const LATER = ['registered', 'docs_submitted', 'agreement_signed', 'active'];

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

    const raw = await req.json().catch(() => ({}));
    const partner_id = String(raw.partner_id ?? '').trim();
    const to = String(raw.to ?? '').trim();
    const subject = headerSafe(String(raw.subject ?? '').trim());
    const body_text = String(raw.body_text ?? '').trim();
    const cc = raw.cc ? headerSafe(String(raw.cc)) : undefined;
    const attach_codes: string[] | null = Array.isArray(raw.attach_codes) ? raw.attach_codes.map(String) : null;
    if (!partner_id || !to || !subject || !body_text) return json({ error: 'partner_id, to, subject, body_text required' }, 400);
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return json({ error: 'invalid recipient' }, 400);

    const { data: partner, error: pErr } = await svc.from('gh_placement_partners')
      .select('id, name, outreach_status').eq('id', partner_id).single();
    if (pErr || !partner) return json({ error: 'partner not found' }, 404);

    // attachments
    let q = svc.from('gh_placement_partner_pack').select('code,title,file_path,file_name,mime_type,status,attach_by_default').eq('status', 'current');
    const { data: packRows } = await q;
    const chosen = (packRows || []).filter((r: any) =>
      r.file_path && (attach_codes ? attach_codes.includes(r.code) : r.attach_by_default));
    const attachments: { filename: string; content: Uint8Array; contentType: string }[] = [];
    for (const r of chosen) {
      const dl = await svc.storage.from('partner-pack').download(r.file_path);
      if (dl.error || !dl.data) return json({ error: `attachment ${r.code} unavailable: ${dl.error?.message}` }, 500);
      attachments.push({ filename: r.file_name, content: new Uint8Array(await dl.data.arrayBuffer()), contentType: r.mime_type || 'application/pdf' });
    }

    const smtpUser = Deno.env.get('GMAIL_USER') || 'support@elabsolution.org';
    const smtpPass = Deno.env.get('GMAIL_APP_PASSWORD');
    if (!smtpPass) return json({ error: 'mailer not configured' }, 500);
    const t = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } });

    const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111827;max-width:680px">' +
      escapeHtml(body_text).replace(/\n/g, '<br>') + '</div>';
    const info = await t.sendMail({
      from: `"Samuel Akinjopo — Global Hire Consult" <${smtpUser}>`,
      replyTo: 'globalhire@elabsolution.org',
      to, cc, subject, text: body_text, html,
      attachments: attachments.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    });

    const status_after = LATER.includes(partner.outreach_status) ? null : 'contacted';
    const { error: logErr } = await svc.from('gh_placement_partner_outreach').insert({
      partner_id, channel: 'email', direction: 'outbound', status_after,
      summary: `Intro email sent to ${to}${attachments.length ? ` with ${attachments.length} attachment(s): ${attachments.map(a => a.filename).join(', ')}` : ''}`,
      logged_by: user.id, email_subject: subject, email_to: to, email_message_id: info?.messageId ?? null,
      attachments: attachments.map(a => a.filename),
    });
    return json({ ok: true, message_id: info?.messageId ?? null, attachments: attachments.length, log_error: logErr?.message ?? null });
  } catch (e) {
    return json({ error: (e as Error)?.message || String(e) }, 500);
  }
});
