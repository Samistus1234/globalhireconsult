import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

export function validatePostBody(raw: Record<string, unknown>):
  | { ok: true; value: { thread_id: string; body: string; attachments: { path: string }[] }; error?: never }
  | { ok: false; value?: never; error: string } {
  const thread_id = String(raw.thread_id ?? '').trim();
  const body = String(raw.body ?? '').trim();
  if (!thread_id) return { ok: false, error: 'thread_id required' };
  if (!body) return { ok: false, error: 'body required' };
  // sender_side is NEVER taken from the client — it is derived below from is_admin().
  return { ok: true, value: { thread_id, body,
    attachments: Array.isArray(raw.attachments) ? raw.attachments as { path: string }[] : [] } };
}

// An attachment path must sit literally under this agency's prefix. Reject any '..'
// outright rather than trying to normalise it.
export function attachmentsInsideAgency(attachments: { path?: string }[], agencyId: string): boolean {
  const prefix = `marketplace/agency/${agencyId}/`;
  return attachments.every((a) => {
    const p = String(a?.path ?? '');
    return p.startsWith(prefix) && !p.includes('..');
  });
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

    const parsed = validatePostBody(await req.json());
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const v = parsed.value;

    const { data: thread, error: tErr } = await svc.schema('globalhire').from('mp_threads')
      .select('id, agency_id').eq('id', v.thread_id).single();
    if (tErr || !thread) return json({ error: 'thread not found' }, 404);

    const { data: caller } = await svc.from('gh_profiles').select('role').eq('id', user.id).single();
    const isAdmin = caller?.role === 'admin';
    if (!isAdmin) {
      const { data: member } = await svc.schema('globalhire').from('mp_agency_members')
        .select('agency_id').eq('user_id', user.id).eq('agency_id', thread.agency_id)
        .eq('status', 'active').maybeSingle();
      if (!member) return json({ error: 'not a member of this agency' }, 403);
    }

    if (!attachmentsInsideAgency(v.attachments, thread.agency_id)) {
      return json({ error: 'attachment path outside this agency' }, 400);
    }

    const { data, error } = await svc.schema('globalhire').rpc('mp_append_message', {
      p_thread_id: v.thread_id, p_body: v.body, p_attachments: v.attachments,
      p_sender: user.id, p_side: isAdmin ? 'gh' : 'agency',
    });
    if (error) return json({ error: error.message }, 400);

    return json({ success: true, message_id: data });
  } catch (e) {
    console.error('mp-thread-post error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
