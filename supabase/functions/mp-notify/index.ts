import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.10';
import { buildEmailHtml } from '../_shared/gh-email-shell.ts';

/*
  mp-notify — fan-out notifications for a partner-marketplace message
  (schema-v40-mp-messaging.sql: globalhire.mp_messages / mp_threads /
  mp_agencies / mp_agency_members / mp_notifications; Task 8's DB trigger
  calls this after INSERT on mp_messages).

  Auth: x-internal-secret header must equal the INTERNAL_TRIGGER_SECRET
  function secret — the notify-interest pattern. Never callable with the
  anon key alone.

  Body: { message_id }
  Recipients are resolved HERE, server-side, from message_id alone — never
  read from the payload. A payload-supplied recipient would let anyone
  holding the secret mail arbitrary addresses.

  Email is branded via the shared gh-email-shell (design B) — every other
  GlobalHire notification (welcome-applicant, stage-change-notify) uses it,
  and an unbranded plain-text mail in that context reads as phishing. Email
  failure is always non-fatal: email_sent records what actually happened,
  a dead SMTP must never cost a notification row.
*/

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// The one HTML-escaping boundary for this function. `buildNotification`
// deliberately returns PLAIN text (n.title is also used as the email
// `subject:` header and is written verbatim to mp_notifications.title, which
// the in-app bell renders through its own escaping — pre-escaping it there
// would show the literal "&lt;" to users). Escaping happens only where a
// value crosses into an HTML document: at the buildEmailHtml call site.
export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Header-safe: strip CR/LF/tabs/control chars and cap length (prevents email
// header injection via attacker-controlled profile full_name / campaign
// title). Matches notify-interest/index.ts's headerSafe exactly — same
// replacements, same order, same .trim().slice(0, 120) — so this is one
// convention, not two. mp_agencies.name is free text from self-serve
// registration (`String(raw.agency_name ?? '').trim()`, mp-agency-register)
// reachable while pending_verification; .trim() there only strips leading/
// trailing whitespace, so an interior CR/LF (e.g. "Acme\r\nBcc: x@evil.com")
// survives into n.title and would otherwise reach the subject: header raw.
export function headerSafe(s: string): string {
  return String(s).replace(/[\r\n\t]+/g, ' ').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 120);
}

export function buildNotification(side: string, agencyName: string, subject: string, threadId: string) {
  const fromGh = side === 'gh';
  return {
    type: 'new_message' as const,
    title: fromGh ? 'New message from GlobalHire' : `New message from ${agencyName}`,
    body: subject,
    link: fromGh ? `partners-messages.html?thread=${threadId}`
                 : `admin-mp-messages.html?thread=${threadId}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // Only the DB trigger (which holds the secret) may invoke this — the
    // anon key alone is not sufficient. Checked BEFORE anything else.
    const secret = Deno.env.get('INTERNAL_TRIGGER_SECRET');
    if (!secret || req.headers.get('x-internal-secret') !== secret) {
      return json({ error: 'unauthorized' }, 401);
    }
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const message_id = String((await req.json()).message_id ?? '');
    if (!message_id) return json({ error: 'message_id required' }, 400);

    const { data: msg } = await svc.schema('globalhire').from('mp_messages')
      .select('id, thread_id, sender_side, sender_user_id, body_md').eq('id', message_id).single();
    if (!msg) return json({ error: 'message not found' }, 404);

    const { data: thread } = await svc.schema('globalhire').from('mp_threads')
      .select('id, agency_id, subject').eq('id', msg.thread_id).single();
    if (!thread) return json({ error: 'thread not found' }, 404);

    const { data: agency } = await svc.schema('globalhire').from('mp_agencies')
      .select('name').eq('id', thread.agency_id).single();

    // Recipients are resolved HERE, never from the payload.
    let recipientIds: string[] = [];
    if (msg.sender_side === 'gh') {
      const { data: members } = await svc.schema('globalhire').from('mp_agency_members')
        .select('user_id').eq('agency_id', thread.agency_id).eq('status', 'active');
      recipientIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
    } else {
      const { data: admins } = await svc.from('gh_profiles').select('id').eq('role', 'admin');
      recipientIds = (admins ?? []).map((a: { id: string }) => a.id);
    }
    recipientIds = recipientIds.filter((id) => id !== msg.sender_user_id);

    const n = buildNotification(msg.sender_side, agency?.name ?? 'an agency', thread.subject, thread.id);

    const smtpUser = Deno.env.get('GMAIL_USER') || 'support@elabsolution.org';
    const smtpPass = Deno.env.get('GMAIL_APP_PASSWORD');
    const site = Deno.env.get('SITE_URL') || 'https://globalhire.elabsolution.org';
    const logoUrl = site + '/assets/brand/globalhire-logo-white.png';
    let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
    if (smtpPass) {
      transport = nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } });
    }

    // Message body AND the agency-name-derived title are user-controlled
    // (agency name is free text from self-serve registration, reachable at
    // pending_verification, before any staff review). Everything that
    // crosses into this HTML document must be escaped at that boundary —
    // n.title included, even though buildNotification itself returns it
    // plain (see escapeHtml's comment above).
    const ctaUrl = `${site}/${n.link}`; // n.link embeds thread.id, a DB uuid PK — not user text (see report)
    const bodyHtml =
      '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">' + escapeHtml(n.body) + '</p>' +
      '<p style="margin:0 0 16px;font-size:14.5px;line-height:1.7;color:#334155;white-space:pre-wrap;">' +
      escapeHtml(msg.body_md) + '</p>';
    const html = buildEmailHtml({
      logoUrl,                 // constant: SITE_URL env + fixed asset path — not user data
      eyebrow: 'NEW MESSAGE',  // constant literal
      headline: escapeHtml(n.title), // user data (agency name) — must be escaped here
      greeting: 'Hello,',      // constant literal
      bodyHtml,                // built above with escapeHtml() on every user-derived piece
      ctaLabel: 'Open Thread', // constant literal
      ctaUrl,                  // site (env) + n.link (fixed page name + DB uuid) — not user text
      footerSubtitle: 'GlobalHire@eLab — International Healthcare Recruitment', // constant literal
      // closingHtml / footerLine2 not passed — nothing to escape
    });
    const text = `${n.body}\n\n${msg.body_md}\n\nOpen: ${ctaUrl}`;

    for (const uid of recipientIds) {
      let emailed = false;
      if (transport) {
        try {
          const { data: u } = await svc.auth.admin.getUserById(uid);
          const to = u?.user?.email;
          if (to) {
            // subject: is a header context — n.title carries the same
            // attacker-controlled agency name as the HTML headline, so it
            // must go through headerSafe() here, not escapeHtml(). from: is
            // built from smtpUser (an env var, not reachable from any
            // request path). to: comes from Supabase's own auth.users via
            // getUserById, not from mp-notify's own reachable free-text
            // inputs. text/html are bodies, not header contexts — untouched.
            await transport.sendMail({
              from: `"GlobalHire Partners" <${smtpUser}>`, to, subject: headerSafe(n.title),
              text, html,
            });
            emailed = true;
          }
        } catch (e) {
          // Non-fatal: a dead SMTP must never lose the notification row.
          console.warn('mp-notify email failed (non-fatal):', (e as Error).message);
        }
      }
      await svc.schema('globalhire').from('mp_notifications').insert({
        user_id: uid,
        agency_id: msg.sender_side === 'gh' ? thread.agency_id : null,
        type: n.type, title: n.title, body: n.body, link: n.link, email_sent: emailed,
      });
    }
    if (transport) transport.close();

    return json({ success: true, notified: recipientIds.length });
  } catch (e) {
    console.error('mp-notify error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
