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
// "Not supplied" (null/undefined/empty string) is a legitimate optional-field state and must
// resolve to `null`. Anything else that doesn't parse to a finite number is a validation
// FAILURE, not a silent null — a typo like "80,000" or "8O000" must come back as a readable
// 400 naming the field, never a job that silently saves with no salary. Never strip commas or
// guess: "1,5" means 1.5 in much of the world, so refuse rather than mis-parse.
function parseNum(x: unknown, field: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (x == null || x === '') return { ok: true, value: null };
  const n = Number(x);
  if (!Number.isFinite(n)) return { ok: false, error: `${field} must be a number` };
  return { ok: true, value: n };
}
const strArray = (x: unknown): string[] => (Array.isArray(x) ? x.map((v) => String(v)) : []);

export function validateJobBody(raw: Record<string, unknown>):
  | { ok: true; value: JobFields; error?: never }
  | { ok: false; value?: never; error: string } {
  // `id` present -> this is a partial UPDATE (see buildJobPatch below), so title (and every
  // other field) is only required to be non-blank if the caller actually sent it. `id` absent
  // -> this is an INSERT and title is mandatory, same as before.
  const id = raw.id == null || raw.id === '' ? undefined : String(raw.id);
  const isUpdate = id !== undefined;
  const titleProvided = Object.hasOwn(raw, 'title');
  const title = titleProvided ? String(raw.title ?? '').trim() : '';
  if ((!isUpdate || titleProvided) && !title) return { ok: false, error: 'title required' };

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

  const salary_min = parseNum(raw.salary_min, 'salary_min');
  if (!salary_min.ok) return salary_min;
  const salary_max = parseNum(raw.salary_max, 'salary_max');
  if (!salary_max.ok) return salary_max;
  const placement_fee_amount = parseNum(raw.placement_fee_amount, 'placement_fee_amount');
  if (!placement_fee_amount.ok) return placement_fee_amount;
  const min_experience_years = parseNum(raw.min_experience_years, 'min_experience_years');
  if (!min_experience_years.ok) return min_experience_years;
  const age_min = parseNum(raw.age_min, 'age_min');
  if (!age_min.ok) return age_min;
  const age_max = parseNum(raw.age_max, 'age_max');
  if (!age_max.ok) return age_max;

  const employer_confidential = raw.employer_confidential === true || raw.employer_confidential === 'true';

  // Built field by field — never spread `raw` — so an unexpected key in the request body
  // (posted_by, created_at, updated_at, published_at, or anything else) can never reach the
  // insert. `id` is the one deliberate exception: it names which row to edit, never who wrote it.
  const value: JobFields = {
    ...(id !== undefined ? { id } : {}),
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
    salary_min: salary_min.value,
    salary_max: salary_max.value,
    salary_currency: strOrNull(raw.salary_currency),
    salary_display: strOrNull(raw.salary_display),
    benefits: strArray(raw.benefits),
    jd_text: strOrNull(raw.jd_text),
    status,
    placement_fee_amount: placement_fee_amount.value,
    placement_fee_currency: strOrNull(raw.placement_fee_currency),
    partner_split_pct,
    source,
    origin_campaign_id: strOrNull(raw.origin_campaign_id),
    min_experience_years: min_experience_years.value,
    required_licences: strArray(raw.required_licences),
    required_exams: strArray(raw.required_exams),
    nationality_prefs: strArray(raw.nationality_prefs),
    gender_pref: strOrNull(raw.gender_pref),
    age_min: age_min.value,
    age_max: age_max.value,
    language_reqs: strArray(raw.language_reqs),
    extra_criteria: (raw.extra_criteria && typeof raw.extra_criteria === 'object' && !Array.isArray(raw.extra_criteria))
      ? raw.extra_criteria as Record<string, unknown>
      : {},
    closes_at: strOrNull(raw.closes_at),
  };

  return { ok: true, value };
}

// This function is the ONLY write path to mp_jobs, so an update must never be built from the
// full validated value — that would write defaults/nulls over every column a partial body
// (e.g. `{id, status:'open'}` to publish a job) didn't resend. A patch includes a field ONLY
// when the key was actually present in the raw request body — driven off `Object.hasOwn(raw,
// key)`, NEVER off whether the validated value happens to be null. Those are different
// questions: `{id, salary_min: null}` means "clear the salary" (key present, value null) and
// must end up in the patch; `{id}` with no salary_min key at all means "leave it alone" and
// must not. Conflating the two is exactly how this class of bug comes back.
export function buildJobPatch(raw: Record<string, unknown>, value: JobFields): Record<string, unknown> {
  const v = value as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(v)) {
    if (key === 'id') continue; // never part of the SET list — it's the update target
    if (Object.hasOwn(raw, key)) patch[key] = v[key];
  }
  return patch;
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

    const raw = await req.json();
    const parsed = validateJobBody(raw);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const v = parsed.value;

    const { data: caller } = await svc.from('gh_profiles').select('role').eq('id', user.id).single();
    const isAdmin = caller?.role === 'admin';
    if (!isAdmin) return json({ error: 'admin only' }, 403);

    if (v.id) {
      // UPDATE: patch only the keys the caller actually sent (see buildJobPatch) — an
      // .update() targeted at this one row, never an .upsert() of the full validated value,
      // so a partial body can't blank out every column it didn't resend.
      const patch = buildJobPatch(raw, v);
      // posted_by is deliberately absent from the patch's key set (buildJobPatch only ever
      // copies fields present in `raw`, and posted_by is never a field validateJobBody exposes
      // from the body) — it is therefore never overwritten by an edit, so the original poster
      // stays the poster no matter who edits the job later.
      patch.updated_at = new Date().toISOString();

      // published_at is only ever stamped, never client-supplied: if this patch is turning the
      // job 'open' and it has not been published before, stamp it now.
      if (patch.status === 'open') {
        const { data: existing, error: fetchErr } = await svc.schema('globalhire').from('mp_jobs')
          .select('published_at').eq('id', v.id).maybeSingle();
        if (fetchErr) return json({ error: fetchErr.message }, 400);
        if (!existing?.published_at) patch.published_at = new Date().toISOString();
      }

      const { data, error } = await svc.schema('globalhire').from('mp_jobs')
        .update(patch).eq('id', v.id)
        .select('id')
        .single();
      if (error) return json({ error: error.message }, 400);

      return json({ success: true, id: data.id });
    }

    // INSERT: the full validated value, with posted_by from the verified JWT and published_at
    // stamped immediately if the job is created already 'open'.
    const row = {
      ...v,
      posted_by: user.id,
      published_at: v.status === 'open' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await svc.schema('globalhire').from('mp_jobs')
      .insert(row)
      .select('id')
      .single();
    if (error) return json({ error: error.message }, 400);

    return json({ success: true, id: data.id });
  } catch (e) {
    console.error('mp-job-write error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
