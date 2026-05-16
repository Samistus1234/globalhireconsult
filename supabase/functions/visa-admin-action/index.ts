// POST /visa-admin-action — admin only.
// Body: { action, case_id, doc_id?, reason? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

export const ALLOWED_ACTIONS = [
  'accept_doc', 'reject_doc', 'request_revision', 'reject_intake', 'mark_issued', 'refund',
] as const;
export type AdminAction = typeof ALLOWED_ACTIONS[number];

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return new Response('auth required', { status: 401 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'globalhire' } },
  );

  const { data: u } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
  if (!u?.user) return new Response('invalid token', { status: 401 });
  const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', u.user.id).single();
  if (!prof?.is_admin) return new Response('admin only', { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.action || !body?.case_id) return new Response('action + case_id required', { status: 400 });
  if (!ALLOWED_ACTIONS.includes(body.action)) return new Response('unknown action', { status: 400 });

  const adminId = u.user.id;
  let newStatus: string | null = null;

  switch (body.action as AdminAction) {
    case 'accept_doc':
      if (!body.doc_id) return new Response('doc_id required', { status: 400 });
      await supabase.from('visa_case_documents').update({ review_status: 'accepted', reviewer_note: null }).eq('id', body.doc_id);
      break;

    case 'reject_doc':
      if (!body.doc_id) return new Response('doc_id required', { status: 400 });
      await supabase.from('visa_case_documents').update({ review_status: 'rejected', reviewer_note: body.reason ?? null }).eq('id', body.doc_id);
      break;

    case 'request_revision':
      newStatus = 'docs_revision';
      await supabase.from('visa_cases').update({ status: newStatus }).eq('id', body.case_id);
      break;

    case 'reject_intake':
      newStatus = 'rejected_intake';
      await supabase.from('visa_cases').update({ status: newStatus, refund_reason: body.reason ?? null }).eq('id', body.case_id);
      // Mark deposit invoice for refund
      await supabase.from('visa_invoices').update({ status: 'refunded' }).eq('case_id', body.case_id).eq('kind', 'deposit');
      break;

    case 'mark_issued':
      newStatus = 'issued';
      await supabase.from('visa_cases').update({ status: newStatus, issued_at: new Date().toISOString() }).eq('id', body.case_id);
      break;

    case 'refund':
      newStatus = 'refunded';
      await supabase.from('visa_cases').update({ status: newStatus, refund_reason: body.reason ?? null }).eq('id', body.case_id);
      break;
  }

  await supabase.from('visa_case_events').insert({
    case_id: body.case_id, actor_id: adminId, event_type: 'admin:' + body.action,
    payload: { reason: body.reason ?? null, doc_id: body.doc_id ?? null, new_status: newStatus },
  });

  if (newStatus) {
    await fetch(Deno.env.get('SUPABASE_URL') + '/functions/v1/notify-visa-status', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') },
      body: JSON.stringify({ case_id: body.case_id, new_status: newStatus, revision_reason: body.reason, refund_reason: body.reason }),
    });
  }

  return new Response(JSON.stringify({ ok: true, new_status: newStatus }), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
