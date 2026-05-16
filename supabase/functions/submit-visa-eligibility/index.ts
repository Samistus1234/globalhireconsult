// supabase/functions/submit-visa-eligibility/index.ts
// POST /submit-visa-eligibility — anonymous, called by the wizard.
// Body: { outcome, nationality?, sponsor_iqama?, contact_email?, contact_phone?, session_id?, utm_*? }
// Returns: { lead_id, suggested_visa: VisaType | null }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { OUTCOME_TO_VISA, type VisaType } from '../_shared/visa-types.ts';

export interface WizardSubmission {
  outcome: string;
  nationality?: string;
  sponsor_iqama?: string;
  contact_email?: string;
  contact_phone?: string;
}

interface UTM {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export interface LeadRow {
  outcome: string;
  suggested_visa: VisaType | null;
  nationality: string | null;
  sponsor_iqama: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  session_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

export function buildLeadRow(sub: WizardSubmission, sessionId: string, utm: UTM): LeadRow {
  return {
    outcome:        sub.outcome,
    suggested_visa: OUTCOME_TO_VISA[sub.outcome] ?? null,
    nationality:    sub.nationality ?? null,
    sponsor_iqama:  sub.sponsor_iqama ?? null,
    contact_email:  sub.contact_email ?? null,
    contact_phone:  sub.contact_phone ?? null,
    session_id:     sessionId,
    utm_source:     utm.utm_source ?? null,
    utm_medium:     utm.utm_medium ?? null,
    utm_campaign:   utm.utm_campaign ?? null,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.outcome !== 'string') {
    return new Response(JSON.stringify({ error: 'outcome (string) required' }), {
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const sessionId = body.session_id ?? crypto.randomUUID();
  const utm: UTM = {
    utm_source:   body.utm_source,
    utm_medium:   body.utm_medium,
    utm_campaign: body.utm_campaign,
  };
  const row = buildLeadRow(body, sessionId, utm);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'globalhire' } },
  );

  const { data, error } = await supabase
    .from('visa_leads')
    .insert(row)
    .select('id, suggested_visa')
    .single();

  if (error) {
    console.error('visa_leads insert failed', error);
    return new Response(JSON.stringify({ error: 'database insert failed' }), {
      status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ lead_id: data.id, suggested_visa: data.suggested_visa }), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
