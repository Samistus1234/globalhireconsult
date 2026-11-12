// POST /start-visa-case — requires authenticated user.
// Body: { visa_type, sponsor_iqama?, sponsor_name?, travel_dates?, lead_id?, provider: 'paystack'|'stripe',
//         applicant?: { passport_number?, nationality?, whatsapp? }, sponsor_relationship?: string[],
//         travellers?: { people, currency, total, counts, lines } }
// Returns: { case_id, invoice_id, payment_url }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

import {
  buildCaseRow, sanitizeApplicant, sanitizeRelationship, sanitizeTravellers, DEPOSIT_USD,
} from './case-row.ts';
export * from './case-row.ts';

async function paystackCheckout(amountUSD: number, caseId: string, email: string): Promise<string> {
  const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!PAYSTACK_SECRET) throw new Error('PAYSTACK_SECRET_KEY not configured');

  const resp = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: amountUSD * 100,
      currency: 'USD',
      metadata: { case_id: caseId, kind: 'deposit' },
      callback_url: `${Deno.env.get('GH_SITE_URL') ?? 'https://globalhire.elabsolution.org'}/dashboard-visa-case.html?id=${caseId}`,
    }),
  });
  const json = await resp.json();
  if (!json.status || !json.data?.authorization_url) throw new Error(`Paystack init failed: ${JSON.stringify(json)}`);
  return json.data.authorization_url as string;
}

async function stripeCheckout(amountUSD: number, caseId: string, email: string): Promise<string> {
  const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY');
  if (!STRIPE_SECRET) throw new Error('STRIPE_SECRET_KEY not configured');

  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('customer_email', email);
  params.append('line_items[0][price_data][currency]',          'usd');
  params.append('line_items[0][price_data][product_data][name]', 'Visa case deposit');
  params.append('line_items[0][price_data][unit_amount]',        String(amountUSD * 100));
  params.append('line_items[0][quantity]',                       '1');
  params.append('metadata[case_id]', caseId);
  params.append('metadata[kind]',    'deposit');
  params.append('success_url', `${Deno.env.get('GH_SITE_URL') ?? 'https://globalhire.elabsolution.org'}/dashboard-visa-case.html?id=${caseId}&paid=1`);
  params.append('cancel_url',  `${Deno.env.get('GH_SITE_URL') ?? 'https://globalhire.elabsolution.org'}/dashboard-visa-case.html?id=${caseId}&paid=0`);

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const json = await resp.json();
  if (!json.url) throw new Error(`Stripe init failed: ${JSON.stringify(json)}`);
  return json.url as string;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'auth required' }), { status: 401, headers: corsHeaders });
  }

  // Trusted server logic: use the service-role key so writes bypass RLS. We validate the
  // user from their token below and set candidate_id to the verified uid. Do NOT pass the
  // user JWT as a global header — that downgrades every query to role `authenticated`, and
  // visa_cases has no INSERT policy, so the insert would be denied ("case create failed").
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'globalhire' } },
  );

  // Resolve user from their bearer token (independent of the client's service-role key).
  const { data: userResp } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!userResp?.user) {
    return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401, headers: corsHeaders });
  }
  const user = userResp.user;

  const body = await req.json().catch(() => null);
  if (!body?.visa_type || !body?.provider) {
    return new Response(JSON.stringify({ error: 'visa_type and provider required' }), { status: 400, headers: corsHeaders });
  }

  const caseRow = buildCaseRow({
    visa_type:     body.visa_type,
    sponsor_iqama: body.sponsor_iqama ?? null,
    sponsor_name:  body.sponsor_name ?? null,
    travel_dates:  body.travel_dates ?? null,
    lead_id:       body.lead_id ?? null,
    applicant_details:    sanitizeApplicant(body.applicant),
    sponsor_relationship: sanitizeRelationship(body.sponsor_relationship),
    travellers:           sanitizeTravellers(body.travellers),
  }, user.id);

  const { data: created, error: caseErr } = await supabase
    .from('visa_cases')
    .insert(caseRow)
    .select('id')
    .single();
  if (caseErr || !created) {
    console.error('visa_cases insert failed', caseErr);
    return new Response(JSON.stringify({ error: 'case create failed' }), { status: 500, headers: corsHeaders });
  }

  const { data: invoice, error: invErr } = await supabase
    .from('visa_invoices')
    .insert({
      case_id:      created.id,
      kind:         'deposit',
      amount_usd:   DEPOSIT_USD,
      provider:     body.provider,
      status:       'pending',
    })
    .select('id')
    .single();
  if (invErr || !invoice) {
    return new Response(JSON.stringify({ error: 'invoice create failed' }), { status: 500, headers: corsHeaders });
  }

  // Drain the sync outbox immediately so the Command Centre creates + emails the deposit
  // invoice within seconds (instead of waiting for the ~5-min cron). The cron remains the
  // fallback if this push fails. Fire it and wait briefly so it isn't killed on response.
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/gh-visa-sync-push`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: '{}',
    });
  } catch (e) {
    console.error('immediate sync push failed (cron will retry)', e);
  }

  // No on-site checkout. The case syncs to the Command Centre, which auto-generates the
  // deposit invoice and emails it to the applicant (pay online or by bank transfer from the
  // email). This replaces the old Paystack-on-site step. paystackCheckout/stripeCheckout
  // remain available for a future "pay now" option but are not used here.
  return new Response(
    JSON.stringify({ case_id: created.id, invoice_id: invoice.id, invoice_emailed: true }),
    { headers: { ...corsHeaders, 'content-type': 'application/json' } },
  );
});
