import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'sign in first' }, 401);
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const uc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return json({ error: 'sign in first' }, 401);

    const { token } = await req.json();
    if (!token) return json({ error: 'token required' }, 400);

    const { data: inv } = await svc.schema('globalhire').from('mp_agency_invites')
      .select('*').eq('token', token).maybeSingle();
    if (!inv || inv.status !== 'pending') return json({ error: 'invite not found or already used' }, 400);
    if (new Date(inv.expires_at) < new Date()) {
      await svc.schema('globalhire').from('mp_agency_invites').update({ status: 'expired' }).eq('id', inv.id);
      return json({ error: 'invite expired' }, 400);
    }

    const { data: existing } = await svc.schema('globalhire').from('mp_agency_members')
      .select('agency_id').eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (existing && existing.agency_id !== inv.agency_id)
      return json({ error: 'you already belong to another agency' }, 409);

    await svc.schema('globalhire').from('mp_agency_members').upsert({
      agency_id: inv.agency_id, user_id: user.id, role: inv.role, status: 'active', invited_by: inv.invited_by,
    }, { onConflict: 'agency_id,user_id' });
    await svc.schema('globalhire').from('mp_agency_invites').update({
      status: 'accepted', accepted_at: new Date().toISOString(), accepted_user_id: user.id,
    }).eq('id', inv.id);

    return json({ success: true, agency_id: inv.agency_id });
  } catch (e) {
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
