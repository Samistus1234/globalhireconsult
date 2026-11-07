// security-probe — canonical source, copied into each other Supabase project's
// supabase/functions/security-probe/index.ts by scripts/security/install-probe.sh.
//
// SELF-CONTAINED ON PURPOSE: no imports from CC _shared (it is copied into other repos).
// Read-only. Auth: header x-security-probe compared in constant time with env PROBE_SECRET
// (missing env -> everything is refused). No CORS. Everything is computed inside the project with
// its own service role through ONE read-only SQL helper, public.security_probe_snapshot(since),
// installed from scripts/security/probe-migrations/<project>.sql (storage.buckets, auth.users and
// the project's role / bank tables are not reachable through PostgREST otherwise).
//
// Project selection: install-probe.sh rewrites the PROBE_PROJECT line below at install time.
// What "admin" and "payment detail" mean per project is in PROBES below (discovered 2026-11-07).

export type ProbeProject = "academy" | "globalhire" | "partner";
const PROBE_PROJECT: ProbeProject = "globalhire"; // @install:project

type ProbeConfig = {
  /** Where the SQL helper reads admins from (documentation). */
  admins: string;
  payment: ReadonlyArray<{ table: string; accountColumn: string }>;
  maxPaymentRows: number;
};

export const PROBES: Record<ProbeProject, ProbeConfig> = {
  // qpudrlimcydzsgxkdrgx. Admin = public.user_roles.role = 'admin' (4 today; 335 students).
  academy: {
    admins: "public.user_roles(role='admin') -> auth.users (id, email label)",
    payment: [{ table: "tutor_payment_accounts", accountColumn: "account_number" }],
    maxPaymentRows: 500,
  },
  // evzhnsugmvtqgmvzwyix. Admin = globalhire.profiles.role = 'admin' (5; 640 applicants, 8 recruiters);
  // public.user_roles is empty there. Bank detail lives in public.bank_accounts, partner_profiles and referrers.
  globalhire: {
    admins: "globalhire.profiles(role='admin') -> auth.users (id, email label)",
    payment: [
      { table: "bank_accounts", accountColumn: "account_number" },
      { table: "partner_profiles", accountColumn: "payout_account_number" },
      { table: "referrers", accountColumn: "account_number" },
    ],
    maxPaymentRows: 500,
  },
  // xypnjfddqeiqibujsnht. Multi-tenant portal: no role table, no bank/payout tables, no public
  // buckets. Admin-equivalent = tenant_clients.is_partner_principal (partner's own principal login).
  partner: {
    admins: "public.tenant_clients(is_partner_principal) -> id (email label)",
    payment: [],
    maxPaymentRows: 0,
  },
};

export type ProbeEnv = { PROBE_SECRET: string; SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
export type RawSnapshot = {
  admins: Array<{ id: string; email: string | null }>;
  /** Sign-ups since `since` — a count only (M3): no new-user email ever leaves the project. */
  newUsersCount: number;
  publicBuckets: string[];
  paymentRows: Array<{ table: string; id: string; updated_at: string; account_number: string }>;
};
export type ProbeRunner = (since: Date, env: ProbeEnv) => Promise<RawSnapshot>;

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Last 4 digits only; never anything longer. */
export function maskAccount(v: string): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `****${digits.slice(-4)}` : "****";
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const NAME = /^[A-Za-z0-9._ -]{1,100}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const NO_EMAIL = "(no email)";
const clip = (s: unknown, n: number): string => String(s ?? "").slice(0, n);

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A value that fails its pattern is never dropped: it is replaced by a safe, stable placeholder. */
async function safe(v: unknown, re: RegExp, kind: string): Promise<string> {
  const s = typeof v === "string" ? v : String(v ?? "");
  return re.test(s) ? s : `${kind}:${(await sha256Hex(s)).slice(0, 12)}`;
}
const label = async (v: unknown): Promise<string> =>
  v === null || v === undefined || v === "" || v === NO_EMAIL ? NO_EMAIL : safe(v, EMAIL, "invalid-email");

/** Whitelist + mask + placeholder: the only shape that can leave the project. Throws on a reshaped helper result. */
export async function shapeOutput(raw: RawSnapshot, cfg: ProbeConfig) {
  if (
    !raw || !Array.isArray(raw.admins) || !Array.isArray(raw.publicBuckets) || !Array.isArray(raw.paymentRows) ||
    typeof raw.newUsersCount !== "number" || !Number.isInteger(raw.newUsersCount) || raw.newUsersCount < 0
  ) {
    throw new Error("malformed helper result");
  }
  const admins = await Promise.all(
    raw.admins.slice(0, 500).map(async (a) => ({ id: await safe(a?.id, ID, "invalid-id"), label: await label(a?.email) })),
  );
  const publicBuckets = await Promise.all(raw.publicBuckets.slice(0, 200).map((b) => safe(b, NAME, "invalid-name")));
  const rows = await Promise.all(
    raw.paymentRows.map(async (r) => ({
      table: await safe(r?.table, NAME, "invalid-name"),
      id: clip(r?.id, 80),
      updated_at: clip(r?.updated_at, 40),
      masked: maskAccount(r?.account_number),
    })),
  );
  rows.sort((x, y) => (x.table === y.table ? (x.id < y.id ? -1 : x.id > y.id ? 1 : 0) : x.table < y.table ? -1 : 1));
  // The hash covers EVERY row, so a change beyond the cap still shows up.
  const paymentRowsHash = await sha256Hex(rows.map((r) => `${r.table}|${r.id}|${r.updated_at}|${r.masked}`).join("\n"));
  return {
    admins,
    newUsersCount: raw.newUsersCount,
    publicBuckets,
    paymentDetailRows: rows.slice(0, cfg.maxPaymentRows),
    paymentRowCount: rows.length,
    paymentRowsHash,
  };
}

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function handleProbe(
  req: Request,
  env: ProbeEnv,
  run: ProbeRunner,
  project: ProbeProject = PROBE_PROJECT,
): Promise<Response> {
  const secret = env.PROBE_SECRET ?? "";
  const given = req.headers.get("x-security-probe") ?? "";
  if (req.method !== "POST" || secret.length < 16 || !safeEqual(given, secret)) return reply(401, { error: "unauthorized" });

  let since = new Date(Date.now() - 24 * 3600_000);
  try {
    const b: unknown = await req.json();
    const s = b && typeof b === "object" ? (b as { since?: unknown }).since : undefined;
    const t = typeof s === "string" ? Date.parse(s) : NaN;
    if (Number.isFinite(t)) since = new Date(Math.max(t, Date.now() - 7 * 24 * 3600_000));
  } catch {
    // no / bad body: default window
  }
  try {
    return reply(200, await shapeOutput(await run(since, env), PROBES[project]));
  } catch {
    return reply(500, { error: "probe failed" });
  }
}

/** Default runner: one RPC to the read-only helper, with the project's own service role. */
const rpcRunner: ProbeRunner = async (since, env) => {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/security_probe_snapshot`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ p_since: since.toISOString() }),
  });
  if (!r.ok) throw new Error(`security_probe_snapshot ${r.status}`);
  const d = await r.json();
  // No defaults: a reshaped helper result must fail (500), never look like a clean run.
  return { admins: d.admins, newUsersCount: d.new_users_count, publicBuckets: d.public_buckets, paymentRows: d.payment_rows };
};

type DenoLike = { serve: (h: (r: Request) => Promise<Response>) => unknown; env: { get(k: string): string | undefined } };
const denoGlobal = (globalThis as { Deno?: DenoLike }).Deno;
if (denoGlobal && typeof denoGlobal.serve === "function") {
  const g = (k: string) => denoGlobal.env.get(k) ?? "";
  denoGlobal.serve((req) =>
    handleProbe(req, { PROBE_SECRET: g("PROBE_SECRET"), SUPABASE_URL: g("SUPABASE_URL"), SUPABASE_SERVICE_ROLE_KEY: g("SUPABASE_SERVICE_ROLE_KEY") }, rpcRunner)
  );
}
