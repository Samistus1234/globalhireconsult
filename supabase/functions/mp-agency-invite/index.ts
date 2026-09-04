import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.10';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

export function validateInviteBody(raw: Record<string, unknown>):
  { ok: true; value: { email: string; role: string }; error?: never }
  | { ok: false; value?: never; error: string } {
  const email = String(raw.email ?? '').trim().toLowerCase();
  const role = String(raw.role ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'valid email required' };
  if (role !== 'admin' && role !== 'member') return { ok: false, error: 'role must be admin|member' };
  return { ok: true, value: { email, role } };
}
export function inviteExpiry(): Date { return new Date(Date.now() + 14 * 86_400_000); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const uc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const parsed = validateInviteBody(await req.json());
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const { data: mem } = await svc.schema('globalhire').from('mp_agency_members')
      .select('agency_id, role').eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (!mem || !['owner', 'admin'].includes(mem.role))
      return json({ error: 'only an agency owner or admin can invite' }, 403);

    const token = crypto.randomUUID();
    const { data: inv, error } = await svc.schema('globalhire').from('mp_agency_invites').insert({
      agency_id: mem.agency_id, email: parsed.value.email, role: parsed.value.role,
      token, invited_by: user.id, expires_at: inviteExpiry().toISOString(),
    }).select('id').single();
    if (error) return json({ error: error.message }, 400);

    const site = Deno.env.get('SITE_URL') || 'https://globalhire.elabsolution.org';
    const smtpUser = Deno.env.get('GMAIL_USER') || 'support@elabsolution.org';
    const smtpPass = Deno.env.get('GMAIL_APP_PASSWORD');
    if (smtpPass) {
      try {
        const t = nodemailer.createTransport({
          host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } });
        await t.sendMail({
          from: `"GlobalHire Partners" <${smtpUser}>`, to: parsed.value.email,
          subject: 'You have been invited to a GlobalHire Partner agency',
          text: `You've been invited to join an agency on GlobalHire Partners.\n\n`
            + `Accept: ${site}/partners-onboarding.html?invite=${token}\n\n`
            + `If you don't have an account yet, create one first, then open the link above.`,
        });
        t.close();
      } catch (e) { console.warn('invite email failed (non-fatal):', (e as Error).message); }
    }
    return json({ success: true, invite_id: inv.id });
  } catch (e) {
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
