import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const CONTRACT_TYPES = ['permanent', 'locum', 'temporary'];
const STATUSES = ['draft', 'open', 'paused', 'filled', 'closed'];
const SOURCES = ['internal', 'employer', 'imported'];

export interface JobFields {
  id?: string;
  title: string;
  employer_name: string | null;
  employer_confidential: boolean;
  destination_country: string | null;
  city: string | null;
  specialty: string | null;
  subspecialty: string | null;
  seniority_level: string | null;
  contract_type: string | null;
  facility_type: string | null;
  positions_count: number;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_display: string | null;
  benefits: string[];
  jd_text: string | null;
  status: string;
  placement_fee_amount: number | null;
  placement_fee_currency: string | null;
  partner_split_pct: number;
  source: string;
  origin_campaign_id: string | null;
  min_experience_years: number | null;
  required_licences: string[];
  required_exams: string[];
  nationality_prefs: string[];
  gender_pref: string | null;
  age_min: number | null;
  age_max: number | null;
  language_reqs: string[];
  extra_criteria: Record<string, unknown>;
  closes_at: string | null;
}

const strOrNull = (x: unknown): string | null => {
  if (x == null) return null;
  const s = String(x).trim();
  return s === '' ? null : s;
};
const numOrNull = (x: unknown): number | null => {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const strArray = (x: unknown): string[] => (Array.isArray(x) ? x.map((v) => String(v)) : []);

export function validateJobBody(raw: Record<string, unknown>):
  | { ok: true; value: JobFields; error?: never }
  | { ok: false; value?: never; error: string } {
  const title = String(raw.title ?? '').trim();
  if (!title) return { ok: false, error: 'title required' };

  const contract_type = raw.contract_type == null || raw.contract_type === ''
    ? null : String(raw.contract_type).trim();
  if (contract_type !== null && !CONTRACT_TYPES.includes(contract_type)) {
    return { ok: false, error: 'invalid contract_type' };
  }

  const status = raw.status == null || raw.status === '' ? 'draft' : String(raw.status).trim();
  if (!STATUSES.includes(status)) return { ok: false, error: 'invalid status' };

  const source = raw.source == null || raw.source === '' ? 'internal' : String(raw.source).trim();
  if (!SOURCES.includes(source)) return { ok: false, error: 'invalid source' };

  const positions_count = raw.positions_count == null ? 1 : Number(raw.positions_count);
  if (!Number.isFinite(positions_count) || !Number.isInteger(positions_count) || positions_count <= 0) {
    return { ok: false, error: 'positions_count must be a positive integer' };
  }

  const partner_split_pct = raw.partner_split_pct == null ? 50 : Number(raw.partner_split_pct);
  if (!Number.isFinite(partner_split_pct) || partner_split_pct < 0 || partner_split_pct > 100) {
    return { ok: false, error: 'partner_split_pct must be between 0 and 100' };
  }

  const employer_confidential = raw.employer_confidential === true || raw.employer_confidential === 'true';

  // Built field by field — never spread `raw` — so an unexpected key in the request body
  // (posted_by, created_at, updated_at, published_at, or anything else) can never reach the
  // insert. `id` is the one deliberate exception: it names which row to edit, never who wrote it.
  const value: JobFields = {
    ...(raw.id ? { id: String(raw.id) } : {}),
    title,
    employer_name: strOrNull(raw.employer_name),
    employer_confidential,
    destination_country: strOrNull(raw.destination_country),
    city: strOrNull(raw.city),
    specialty: strOrNull(raw.specialty),
    subspecialty: strOrNull(raw.subspecialty),
    seniority_level: strOrNull(raw.seniority_level),
    contract_type,
    facility_type: strOrNull(raw.facility_type),
    positions_count,
    salary_min: numOrNull(raw.salary_min),
    salary_max: numOrNull(raw.salary_max),
    salary_currency: strOrNull(raw.salary_currency),
    salary_display: strOrNull(raw.salary_display),
    benefits: strArray(raw.benefits),
    jd_text: strOrNull(raw.jd_text),
    status,
    placement_fee_amount: numOrNull(raw.placement_fee_amount),
    placement_fee_currency: strOrNull(raw.placement_fee_currency),
    partner_split_pct,
    source,
    origin_campaign_id: strOrNull(raw.origin_campaign_id),
    min_experience_years: numOrNull(raw.min_experience_years),
    required_licences: strArray(raw.required_licences),
    required_exams: strArray(raw.required_exams),
    nationality_prefs: strArray(raw.nationality_prefs),
    gender_pref: strOrNull(raw.gender_pref),
    age_min: numOrNull(raw.age_min),
    age_max: numOrNull(raw.age_max),
    language_reqs: strArray(raw.language_reqs),
    extra_criteria: (raw.extra_criteria && typeof raw.extra_criteria === 'object' && !Array.isArray(raw.extra_criteria))
      ? raw.extra_criteria as Record<string, unknown>
      : {},
    closes_at: strOrNull(raw.closes_at),
  };

  return { ok: true, value };
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

    const parsed = validateJobBody(await req.json());
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const v = parsed.value;

    const { data: caller } = await svc.from('gh_profiles').select('role').eq('id', user.id).single();
    const isAdmin = caller?.role === 'admin';
    if (!isAdmin) return json({ error: 'admin only' }, 403);

    // published_at and posted_by are server-managed: on an edit, preserve the row's existing
    // values (service role, bypasses RLS) rather than trust anything the client sent — published_at
    // only ever gets stamped the first time a job transitions to 'open', and posted_by keeps
    // recording the original author even when a different admin edits the job later.
    let publishedAt: string | null = null;
    let postedBy: string = user.id;
    if (v.id) {
      const { data: existing, error: fetchErr } = await svc.schema('globalhire').from('mp_jobs')
        .select('published_at, posted_by').eq('id', v.id).maybeSingle();
      if (fetchErr) return json({ error: fetchErr.message }, 400);
      publishedAt = (existing?.published_at as string | null | undefined) ?? null;
      postedBy = (existing?.posted_by as string | undefined) ?? user.id;
    }
    if (v.status === 'open' && !publishedAt) {
      publishedAt = new Date().toISOString();
    }

    const row = {
      ...v,
      posted_by: postedBy,
      published_at: publishedAt,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await svc.schema('globalhire').from('mp_jobs')
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .single();
    if (error) return json({ error: error.message }, 400);

    return json({ success: true, id: data.id });
  } catch (e) {
    console.error('mp-job-write error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
