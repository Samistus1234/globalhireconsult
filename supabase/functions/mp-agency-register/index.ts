import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.10';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

export interface RegisterBody {
  full_name: string; email: string; password: string;
  agency_name: string; country?: string; city?: string; phone?: string;
}
export function validateRegisterBody(raw: Record<string, unknown>):
  { ok: true; value: RegisterBody; error?: never } | { ok: false; value?: never; error: string } {
  const full_name = String(raw.full_name ?? '').trim();
  const email = String(raw.email ?? '').trim().toLowerCase();
  const password = String(raw.password ?? '');
  const agency_name = String(raw.agency_name ?? '').trim();
  if (!full_name || !email || !password || !agency_name)
    return { ok: false, error: 'full_name, email, password and agency_name are required' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'invalid email' };
  if (password.length < 8) return { ok: false, error: 'password must be at least 8 characters' };
  return { ok: true, value: {
    full_name, email, password, agency_name,
    country: raw.country ? String(raw.country).trim() : undefined,
    city: raw.city ? String(raw.city).trim() : undefined,
    phone: raw.phone ? String(raw.phone).trim() : undefined,
  } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const parsed = validateRegisterBody(await req.json());
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const b = parsed.value;

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: created, error: cErr } = await sb.auth.admin.createUser({
      email: b.email, password: b.password, email_confirm: false,
      user_metadata: { full_name: b.full_name, role: 'agency', phone: b.phone ?? null },
    });
    if (cErr) return json({ error: cErr.message }, 400);
    const userId = created.user.id;

    const { data: agency, error: aErr } = await sb.schema('globalhire').from('mp_agencies').insert({
      name: b.agency_name, country: b.country ?? null, city: b.city ?? null,
      owner_name: b.full_name, status: 'pending_verification', created_by: userId,
    }).select('id').single();
    if (aErr) { await sb.auth.admin.deleteUser(userId); return json({ error: aErr.message }, 400); }

    const { error: mErr } = await sb.schema('globalhire').from('mp_agency_members').insert({
      agency_id: agency.id, user_id: userId, role: 'owner', status: 'active',
    });
    if (mErr) {
      // Unwind in reverse: drop the ownerless agency row, then the dangling auth user.
      // Failure-tolerant so a cleanup error never masks the original mErr.
      try {
        await sb.schema('globalhire').from('mp_agencies').delete().eq('id', agency.id);
      } catch (e) { console.error('mp-agency-register unwind: agency delete failed:', (e as Error).message); }
      try {
        await sb.auth.admin.deleteUser(userId);
      } catch (e) { console.error('mp-agency-register unwind: user delete failed:', (e as Error).message); }
      return json({ error: mErr.message }, 400);
    }

    // welcome / pending-review email (non-fatal)
    const smtpUser = Deno.env.get('GMAIL_USER') || 'support@elabsolution.org';
    const smtpPass = Deno.env.get('GMAIL_APP_PASSWORD');
    const site = Deno.env.get('SITE_URL') || 'https://globalhire.elabsolution.org';
    if (smtpPass) {
      try {
        const t = nodemailer.createTransport({
          host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass },
        });
        await t.sendMail({
          from: `"GlobalHire Partners" <${smtpUser}>`,
          to: b.email,
          subject: 'GlobalHire Partner registration received',
          text: `Hi ${b.full_name},\n\nWe've received your partner-agency registration for "${b.agency_name}". `
            + `Our team will review and verify your agency shortly — you'll get an email when you're approved.\n\n`
            + `Sign in: ${site}/login.html\n\n— GlobalHire Partners`,
        });
        t.close();
      } catch (e) { console.warn('register email failed (non-fatal):', (e as Error).message); }
    }

    return json({ success: true, user_id: userId, agency_id: agency.id,
      message: 'Registration received. An admin will verify your agency.' });
  } catch (e) {
    console.error('mp-agency-register error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
