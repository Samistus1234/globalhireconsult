import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type MpAiFeature = 'parse' | 'match' | 'screen' | 'draft' | 'dedupe_tiebreak';

export interface MpAiOpts {
  feature: MpAiFeature;
  system: string;
  user: string;
  jsonSchema?: Record<string, unknown>;
  model?: string;
  maxTokens?: number;
  contextId?: string;
  agencyId?: string;
}
export interface MpAiResult {
  ok: boolean;
  data: unknown;
  text: string;
  usage: { prompt: number; completion: number; costUsd: number };
  error?: string;
}

const DEFAULT_MODEL: Record<MpAiFeature, string> = {
  parse: 'claude-sonnet-4-20250514',
  match: 'claude-sonnet-4-20250514',
  screen: 'claude-sonnet-4-20250514',
  draft: 'claude-3-5-haiku-20241022',
  dedupe_tiebreak: 'claude-3-5-haiku-20241022',
};

// USD per 1M tokens (input, output). Update if Anthropic pricing changes.
const PRICING: Record<string, [number, number]> = {
  'claude-sonnet-4-20250514': [3, 15],
  'claude-3-5-haiku-20241022': [0.8, 4],
  'claude-3-haiku-20240307': [0.25, 1.25],
};

export function isAiEnabled(): boolean {
  return Deno.env.get('MP_AI_ENABLED') === 'true';
}

export function estimateCostUsd(model: string, prompt: number, completion: number): number {
  const [inP, outP] = PRICING[model] ?? PRICING['claude-sonnet-4-20250514'];
  return +(((prompt * inP) + (completion * outP)) / 1_000_000).toFixed(5);
}

function svc() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function logRun(row: Record<string, unknown>) {
  try {
    await svc().schema('globalhire').from('mp_ai_runs').insert(row);
  } catch (e) {
    console.warn('mp_ai_runs insert failed (non-fatal):', (e as Error).message);
  }
}

export async function callAI(opts: MpAiOpts): Promise<MpAiResult> {
  const model = opts.model ?? DEFAULT_MODEL[opts.feature];
  const maxTokens = opts.maxTokens ?? 1500;
  const started = Date.now();
  const empty = { prompt: 0, completion: 0, costUsd: 0 };

  if (!isAiEnabled()) {
    return { ok: false, data: null, text: '', usage: empty, error: 'ai_disabled' };
  }
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return { ok: false, data: null, text: '', usage: empty, error: 'no_api_key' };

  const sys = opts.jsonSchema
    ? `${opts.system}\n\nReturn ONLY a JSON object matching this schema, no prose:\n${JSON.stringify(opts.jsonSchema)}`
    : opts.system;

  const doCall = async () => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: sys,
        messages: [{ role: 'user', content: opts.user }],
      }),
    });
    return r;
  };

  try {
    let resp = await doCall();
    if (!resp.ok) {
      const body = await resp.text();
      await logRun({
        feature: opts.feature, context_id: opts.contextId ?? null, agency_id: opts.agencyId ?? null,
        model, status: 'error', error: `http_${resp.status}: ${body.slice(0, 400)}`,
        latency_ms: Date.now() - started,
      });
      return { ok: false, data: null, text: '', usage: empty, error: `http_${resp.status}` };
    }
    const j = await resp.json();
    const text: string = (j.content ?? []).map((b: { text?: string }) => b.text ?? '').join('');
    const prompt = j.usage?.input_tokens ?? 0;
    const completion = j.usage?.output_tokens ?? 0;
    const costUsd = estimateCostUsd(model, prompt, completion);

    let data: unknown = text;
    let parseErr: string | undefined;
    if (opts.jsonSchema) {
      try {
        data = JSON.parse(text.trim().replace(/^```json\s*|\s*```$/g, ''));
      } catch {
        // one retry with an explicit "JSON only" nudge
        const retry = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model, max_tokens: maxTokens, system: sys,
            messages: [
              { role: 'user', content: opts.user },
              { role: 'assistant', content: text },
              { role: 'user', content: 'That was not valid JSON. Reply with ONLY the JSON object.' },
            ],
          }),
        });
        if (retry.ok) {
          const rj = await retry.json();
          const rt: string = (rj.content ?? []).map((b: { text?: string }) => b.text ?? '').join('');
          try { data = JSON.parse(rt.trim().replace(/^```json\s*|\s*```$/g, '')); }
          catch { parseErr = 'json_parse_failed'; }
        } else {
          parseErr = 'json_parse_failed';
        }
      }
    }

    await logRun({
      feature: opts.feature, context_id: opts.contextId ?? null, agency_id: opts.agencyId ?? null,
      model, prompt_tokens: prompt, completion_tokens: completion, cost_usd: costUsd,
      latency_ms: Date.now() - started, status: parseErr ? 'error' : 'ok', error: parseErr ?? null,
    });

    if (parseErr) return { ok: false, data: null, text, usage: { prompt, completion, costUsd }, error: parseErr };
    return { ok: true, data, text, usage: { prompt, completion, costUsd } };
  } catch (e) {
    await logRun({
      feature: opts.feature, context_id: opts.contextId ?? null, agency_id: opts.agencyId ?? null,
      model, status: 'error', error: (e as Error).message, latency_ms: Date.now() - started,
    });
    return { ok: false, data: null, text: '', usage: empty, error: (e as Error).message };
  }
}
