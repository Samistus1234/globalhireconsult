// supabase/functions/check-visa-eligibility/index.ts
// POST /check-visa-eligibility — anonymous, called by wizard step 2.
// Body: { lead_id?, visa_type, nationality?, sponsor_iqama?, sponsor_relationship?, travel_dates? }
// Returns: { passed: boolean, missingDocs, reasons }
// Side effect: if lead_id provided AND passed=true, sets visa_leads.passed_eligibility=true.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { runEligibility, type EligibilityInput } from '../_shared/visa-eligibility-rules.ts';
import type { VisaType } from '../_shared/visa-types.ts';

const VALID_VISA_TYPES: ReadonlyArray<VisaType> = [
  'tourist','umrah','hajj','family_visit','family_residence','business',
  'work_iqama','premium_residency','investor_misa','transit','domestic_worker',
];

const VALID_RELATIONSHIPS = ['spouse','child','parent'] as const;

// deno-lint-ignore no-explicit-any
export function extractEligibilityInput(body: any): EligibilityInput {
  if (!body?.visa_type || !VALID_VISA_TYPES.includes(body.visa_type)) {
    throw new Error('visa_type required and must be a known visa type');
  }
  return {
    visa_type:            body.visa_type,
    nationality:          typeof body.nationality === 'string' ? body.nationality : undefined,
    sponsor_iqama:        typeof body.sponsor_iqama === 'string' ? body.sponsor_iqama : undefined,
    sponsor_relationship: VALID_RELATIONSHIPS.includes(body.sponsor_relationship) ? body.sponsor_relationship : undefined,
    travel_dates:         body.travel_dates && typeof body.travel_dates === 'object' ? {
      arrival:    typeof body.travel_dates.arrival === 'string'  ? body.travel_dates.arrival  : undefined,
      stay_days:  typeof body.travel_dates.stay_days === 'number' ? body.travel_dates.stay_days : undefined,
    } : undefined,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);

  let input: EligibilityInput;
  try {
    input = extractEligibilityInput(body);
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const result = runEligibility(input);

  // Side-effect: mark lead as passed if applicable
  if (result.passed && body?.lead_id && typeof body.lead_id === 'string') {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { db: { schema: 'globalhire' } },
    );
    await supabase
      .from('visa_leads')
      .update({ passed_eligibility: true, suggested_visa: input.visa_type })
      .eq('id', body.lead_id);
  }

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
