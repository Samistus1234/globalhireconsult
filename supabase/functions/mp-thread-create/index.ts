import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { attachmentsInsideAgency } from '../_shared/mp-attachments.ts';

// Re-exported so this function's own tests can import the check from './index.ts', the
// same way mp-thread-post's tests do — the single implementation lives in _shared/mp-attachments.ts.
export { attachmentsInsideAgency };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const CONTEXTS = ['nomination', 'job', 'agency', 'general'];

export function validateCreateBody(raw: Record<string, unknown>):
  | { ok: true; value: { agency_id: string; subject: string; context_type: string;
                         context_id: string | null; body: string; attachments: unknown[] }; error?: never }
  | { ok: false; value?: never; error: string } {
  const agency_id = String(raw.agency_id ?? '').trim();
  const subject = String(raw.subject ?? '').trim();
  const context_type = String(raw.context_type ?? '').trim();
  const body = String(raw.body ?? '').trim();
  if (!agency_id) return { ok: false, error: 'agency_id required' };
  if (!subject) return { ok: false, error: 'subject required' };
  if (!CONTEXTS.includes(context_type)) return { ok: false, error: 'invalid context_type' };
  if (!body) return { ok: false, error: 'body required' };
  // sender_side is NEVER taken from the client — it is derived below from is_admin().
  return { ok: true, value: { agency_id, subject, context_type,
    context_id: raw.context_id ? String(raw.context_id) : null,
    body, attachments: Array.isArray(raw.attachments) ? raw.attachments : [] } };
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

    const parsed = validateCreateBody(await req.json());
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const v = parsed.value;

    const { data: caller } = await svc.from('gh_profiles').select('role').eq('id', user.id).single();
    const isAdmin = caller?.role === 'admin';

    if (!isAdmin) {
      const { data: member } = await svc.schema('globalhire').from('mp_agency_members')
        .select('agency_id').eq('user_id', user.id).eq('agency_id', v.agency_id)
        .eq('status', 'active').maybeSingle();
      if (!member) return json({ error: 'not a member of this agency' }, 403);
    }
    const side = isAdmin ? 'gh' : 'agency';

    if (!attachmentsInsideAgency(v.attachments as { path?: string }[], v.agency_id)) {
      return json({ error: 'attachment path outside this agency' }, 400);
    }

    const { data, error } = await svc.schema('globalhire')
      .rpc('mp_create_thread_with_message', {
        p_agency_id: v.agency_id, p_subject: v.subject, p_context_type: v.context_type,
        p_context_id: v.context_id, p_body: v.body, p_attachments: v.attachments,
        p_sender: user.id, p_side: side,
      });
    if (error) return json({ error: error.message }, 400);

    return json({ success: true, thread_id: data });
  } catch (e) {
    console.error('mp-thread-create error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
