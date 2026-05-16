// supabase/functions/partner-status-sync/index.ts
// Two entry modes:
//   POST /partner-status-sync   (admin-triggered manual update)
//     body: { case_id, partner_status, partner_reference?, visa_pdf_base64? }
//   POST /partner-status-sync (with X-Partner-Token header)
//     inbound webhook from partner; same body shape

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import type { VisaCaseStatus } from '../_shared/visa-types.ts';

export function mapPartnerStatus(s: string): VisaCaseStatus | null {
  switch (s) {
    case 'acknowledged': return 'partner_processing';
    case 'processing':   return 'partner_processing';
    case 'approved':     return 'approved';
    case 'issued':       return 'issued';
    case 'rejected':     return 'rejected_partner';
    default:             return null;
  }
}

// deno-lint-ignore no-explicit-any
async function authIsAdminOrPartner(req: Request, supabase: any): Promise<boolean> {
  const partnerToken = req.headers.get('x-partner-token');
  if (partnerToken && partnerToken === Deno.env.get('PARTNER_WEBHOOK_TOKEN')) return true;

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const { data: u } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
  if (!u?.user) return false;
  const { data: p } = await supabase.from('profiles').select('is_admin').eq('id', u.user.id).single();
  return !!p?.is_admin;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'globalhire' } },
  );

  if (!(await authIsAdminOrPartner(req, supabase))) {
    return new Response('forbidden', { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.case_id || !body?.partner_status) return new Response('case_id + partner_status required', { status: 400 });

  const newStatus = mapPartnerStatus(body.partner_status);
  if (!newStatus) return new Response('unknown partner_status', { status: 400 });

  const update: Record<string, unknown> = { status: newStatus };
  if (body.partner_reference) update.partner_reference = body.partner_reference;

  // If partner sent a PDF, store it
  if (body.visa_pdf_base64) {
    const bytes = Uint8Array.from(atob(body.visa_pdf_base64), (c) => c.charCodeAt(0));
    const path = `partner-deliverables/${body.case_id}/visa.pdf`;
    await supabase.storage.from('visa-documents').upload(path, bytes, {
      contentType: 'application/pdf', upsert: true,
    });
    update.visa_pdf_path = path;
    update.issued_at = new Date().toISOString();
  }

  await supabase.from('visa_cases').update(update).eq('id', body.case_id);
  await supabase.from('visa_case_events').insert({
    case_id: body.case_id, event_type: 'partner_status_sync', payload: { partner_status: body.partner_status, new_status: newStatus },
  });

  // Trigger candidate notification
  await fetch(Deno.env.get('SUPABASE_URL') + '/functions/v1/notify-visa-status', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') },
    body: JSON.stringify({ case_id: body.case_id, new_status: newStatus }),
  });

  return new Response(JSON.stringify({ ok: true, new_status: newStatus }), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
