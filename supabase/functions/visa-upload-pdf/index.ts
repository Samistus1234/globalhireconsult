// POST /visa-upload-pdf?case_id=<uuid>&filename=<name> — admin only.
// Body: the visa PDF (binary). Uploads it to the visa-documents bucket and sets
// visa_cases.visa_pdf_path so the applicant can download it from their portal.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'auth required' }, 401);

  // Service-role client (bypasses RLS); we authorize the caller as admin below.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'globalhire' } },
  );

  const { data: u } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!u?.user) return json({ error: 'invalid token' }, 401);
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', u.user.id).single();
  if (prof?.role !== 'admin') return json({ error: 'admin only' }, 403);

  const url = new URL(req.url);
  const caseId = url.searchParams.get('case_id');
  const rawName = url.searchParams.get('filename') || 'visa.pdf';
  if (!caseId) return json({ error: 'case_id required' }, 400);

  const { data: vc } = await supabase.from('visa_cases').select('candidate_id').eq('id', caseId).maybeSingle();
  if (!vc) return json({ error: 'case not found' }, 404);

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return json({ error: 'empty file' }, 400);
  if (bytes.length > 20 * 1024 * 1024) return json({ error: 'file too large (20MB max)' }, 413);

  const safeName = rawName.replace(/[^\w.\-]/g, '_');
  const path = `${vc.candidate_id}/${caseId}/visa_pdf/${Date.now()}-${safeName}`;

  const up = await supabase.storage.from('visa-documents')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (up.error) return json({ error: 'upload failed: ' + up.error.message }, 500);

  const { error: updErr } = await supabase.from('visa_cases').update({ visa_pdf_path: path }).eq('id', caseId);
  if (updErr) return json({ error: 'could not attach pdf: ' + updErr.message }, 500);

  await supabase.from('visa_case_events').insert({
    case_id: caseId, actor_id: u.user.id, event_type: 'admin:visa_pdf_uploaded', payload: { path },
  });

  return json({ ok: true, visa_pdf_path: path });
});
