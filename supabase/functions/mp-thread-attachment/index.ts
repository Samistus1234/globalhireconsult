import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// A security boundary: reject any '..' outright rather than trying to normalise it,
// require the first two segments to be exactly 'marketplace'/'agency', and require at
// least 4 segments so a bare 'marketplace/agency' (or an empty third segment) can never
// yield a truthy agency id.
export function parseAgencyFromPath(path: string): string | null {
  if (!path || path.includes('..')) return null;
  const parts = path.split('/');
  if (parts.length < 4) return null;
  if (parts[0] !== 'marketplace' || parts[1] !== 'agency') return null;
  return parts[2] || null;
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

    const path = String((await req.json()).path ?? '');
    const agencyId = parseAgencyFromPath(path);
    if (!agencyId) return json({ error: 'invalid path' }, 400);

    const { data: caller } = await svc.from('gh_profiles').select('role').eq('id', user.id).single();
    if (caller?.role !== 'admin') {
      const { data: member } = await svc.schema('globalhire').from('mp_agency_members')
        .select('agency_id').eq('user_id', user.id).eq('agency_id', agencyId)
        .eq('status', 'active').maybeSingle();
      if (!member) return json({ error: 'forbidden' }, 403);
    }

    // Attachments are stored as paths and signed on demand precisely so a URL is never
    // persisted — do not cache or store the returned URL.
    const { data, error } = await svc.storage.from('gh-applicant-documents')
      .createSignedUrl(path, 300);
    if (error) return json({ error: error.message }, 400);

    return json({ success: true, url: data.signedUrl });
  } catch (e) {
    console.error('mp-thread-attachment error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
