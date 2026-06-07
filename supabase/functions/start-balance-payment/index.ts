// POST /start-balance-payment — requires authenticated user.
// Body: { case_id, provider: 'paystack'|'stripe' }
// Returns: { payment_url }
//
// Finds the pending balance invoice for an approved visa case, initiates
// checkout, stores the provider_ref, and returns the redirect URL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Inline cors (mirrors _shared/cors.ts) to keep deploy single-file.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

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
      metadata: { case_id: caseId, kind: 'balance' },
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
  params.append('line_items[0][price_data][product_data][name]', 'Visa case balance payment');
  params.append('line_items[0][price_data][unit_amount]',        String(amountUSD * 100));
  params.append('line_items[0][quantity]',                       '1');
  params.append('metadata[case_id]', caseId);
  params.append('metadata[kind]',    'balance');
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'globalhire' }, global: { headers: { Authorization: authHeader } } },
  );

  // Resolve user from Bearer token (mirrors start-visa-case exactly)
  const { data: userResp } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!userResp?.user) {
    return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401, headers: corsHeaders });
  }
  const user = userResp.user;

  const body = await req.json().catch(() => null);
  if (!body?.case_id || !body?.provider) {
    return new Response(JSON.stringify({ error: 'case_id and provider required' }), { status: 400, headers: corsHeaders });
  }

  // Verify case ownership
  const { data: caseRow, error: caseErr } = await supabase
    .from('visa_cases')
    .select('id, candidate_id, status')
    .eq('id', body.case_id)
    .single();

  if (caseErr || !caseRow) {
    return new Response(JSON.stringify({ error: 'case not found' }), { status: 404, headers: corsHeaders });
  }
  if (caseRow.candidate_id !== user.id) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
  }

  // Find the most recent pending balance invoice
  const { data: invoices, error: invListErr } = await supabase
    .from('visa_invoices')
    .select('id, amount_usd, provider')
    .eq('case_id', body.case_id)
    .eq('kind', 'balance')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);

  if (invListErr) {
    console.error('invoice lookup failed', invListErr);
    return new Response(JSON.stringify({ error: 'invoice lookup failed' }), { status: 500, headers: corsHeaders });
  }
  if (!invoices || invoices.length === 0) {
    return new Response(JSON.stringify({ error: 'no pending balance invoice' }), { status: 404, headers: corsHeaders });
  }
  const invoice = invoices[0];

  let payment_url: string;
  try {
    payment_url = body.provider === 'paystack'
      ? await paystackCheckout(invoice.amount_usd, body.case_id, user.email ?? '')
      : await stripeCheckout(invoice.amount_usd, body.case_id, user.email ?? '');
  } catch (e) {
    console.error('checkout init failed', e);
    return new Response(JSON.stringify({ error: 'checkout init failed' }), { status: 502, headers: corsHeaders });
  }

  // Store provider_ref on the balance invoice (mirrors start-visa-case)
  await supabase
    .from('visa_invoices')
    .update({ provider_ref: payment_url, provider: body.provider })
    .eq('id', invoice.id);

  return new Response(
    JSON.stringify({ payment_url }),
    { headers: { ...corsHeaders, 'content-type': 'application/json' } },
  );
});
