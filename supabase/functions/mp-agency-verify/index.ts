import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.10';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const STATUS_FOR = { verify: 'verified', reject: 'rejected', suspend: 'suspended' } as const;
export function validateVerifyBody(raw: Record<string, unknown>):
  | { ok: true; value: { agency_id: string; action: keyof typeof STATUS_FOR; status: string; note?: string }; error?: never }
  | { ok: false; value?: never; error: string } {
  const agency_id = String(raw.agency_id ?? '').trim();
  const action = String(raw.action ?? '') as keyof typeof STATUS_FOR;
  if (!agency_id) return { ok: false, error: 'agency_id required' };
  if (!(action in STATUS_FOR)) return { ok: false, error: 'action must be verify|reject|suspend' };
  return { ok: true, value: { agency_id, action, status: STATUS_FOR[action],
    note: raw.note ? String(raw.note) : undefined } };
}

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

    const parsed = validateVerifyBody(await req.json());
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const { agency_id, status, note } = parsed.value;

    const { data: agency, error: uErr } = await svc.schema('globalhire').from('mp_agencies')
      .update({ status, verification_note: note ?? null, verified_by: user.id, verified_at: new Date().toISOString() })
      .eq('id', agency_id).select('id, name, status, created_by').single();
    if (uErr) return json({ error: uErr.message }, 400);

    if (status === 'verified') {
      await svc.auth.admin.updateUserById(agency.created_by, { email_confirm: true });
    }

    // notify the owner
    const { data: owner } = await svc.auth.admin.getUserById(agency.created_by);
    const to = owner?.user?.email;
    const smtpUser = Deno.env.get('GMAIL_USER') || 'support@elabsolution.org';
    const smtpPass = Deno.env.get('GMAIL_APP_PASSWORD');
    const site = Deno.env.get('SITE_URL') || 'https://globalhire.elabsolution.org';
    if (to && smtpPass) {
      try {
        const t = nodemailer.createTransport({
          host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } });
        const msg = status === 'verified'
          ? `Your agency "${agency.name}" is verified. Sign in and start nominating candidates: ${site}/partners-dashboard.html`
          : status === 'rejected'
          ? `Your agency application for "${agency.name}" was not approved.${note ? ' Reason: ' + note : ''}`
          : `Your agency "${agency.name}" has been suspended.${note ? ' Reason: ' + note : ''}`;
        await t.sendMail({ from: `"GlobalHire Partners" <${smtpUser}>`, to,
          subject: `GlobalHire Partner status: ${status}`, text: msg });
        t.close();
      } catch (e) { console.warn('verify email failed (non-fatal):', (e as Error).message); }
    }

    return json({ success: true, status });
  } catch (e) {
    console.error('mp-agency-verify error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
