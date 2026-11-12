// Pure logic for start-visa-case: prices, the case row and the input checks.
// Kept apart from index.ts (which starts the server) so tests can import it.
import type { VisaType } from '../_shared/visa-types.ts';

export interface ApplicantDetails {
  passport_number: string | null;
  nationality: string | null;
  whatsapp: string | null;
}

export interface Travellers {
  people: number;
  currency: 'NGN' | 'USD' | null;
  total: number | null;
  counts: Record<string, number>;
  lines: [string, string][];
}

export interface CaseRequest {
  visa_type: VisaType;
  sponsor_iqama: string | null;
  sponsor_name: string | null;
  travel_dates: { arrival?: string; stay_days?: number } | null;
  lead_id: string | null;
  applicant_details?: ApplicantDetails | null;
  sponsor_relationship?: string[] | null;
  travellers?: Travellers | null;
}

// ── Input checks for the details the applicant types (stored as data, never trusted as markup) ──
function cleanText(v: unknown, max: number, pattern?: RegExp): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  if (pattern && !pattern.test(t)) return null;
  return t.slice(0, max);
}

export function sanitizeApplicant(a: unknown): ApplicantDetails | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  const passportRaw = typeof o.passport_number === 'string' ? o.passport_number.replace(/\s+/g, '').toUpperCase() : null;
  const out: ApplicantDetails = {
    passport_number: cleanText(passportRaw, 20, /^[A-Z0-9-]{5,20}$/),
    nationality: cleanText(o.nationality, 60, /^[\p{L} .'()-]+$/u),
    whatsapp: cleanText(o.whatsapp, 24, /^\+?[0-9 ()-]{7,24}$/),
  };
  return out.passport_number || out.nationality || out.whatsapp ? out : null;
}

const RELATIONSHIPS = ['spouse', 'child', 'parent'];
export function sanitizeRelationship(r: unknown): string[] | null {
  const list = Array.isArray(r) ? r : typeof r === 'string' ? [r] : [];
  const out: string[] = [];
  for (const x of list) if (typeof x === 'string' && RELATIONSHIPS.includes(x) && !out.includes(x)) out.push(x);
  return out.length ? out : null;
}

export function sanitizeTravellers(t: unknown): Travellers | null {
  if (!t || typeof t !== 'object') return null;
  const o = t as Record<string, unknown>;
  const people = Number(o.people);
  if (!Number.isInteger(people) || people < 1 || people > 50) return null;
  const counts: Record<string, number> = {};
  if (o.counts && typeof o.counts === 'object') {
    for (const [k, v] of Object.entries(o.counts as Record<string, unknown>)) {
      const n = Number(v);
      if (/^[a-z]$/.test(k) && Number.isInteger(n) && n >= 0 && n <= 50) counts[k] = n;
    }
  }
  const lines: [string, string][] = [];
  if (Array.isArray(o.lines)) {
    for (const l of o.lines.slice(0, 8)) {
      if (Array.isArray(l) && l.length === 2) lines.push([String(l[0]).slice(0, 80), String(l[1]).slice(0, 40)]);
    }
  }
  const total = Number(o.total);
  return {
    people,
    currency: o.currency === 'NGN' || o.currency === 'USD' ? o.currency : null,
    total: Number.isFinite(total) && total >= 0 && total < 1e10 ? Math.round(total) : null,
    counts,
    lines,
  };
}

const V1_PRICE_USD: Partial<Record<VisaType, number>> = {
  tourist:          185,
  umrah:            295,
  family_visit:     543, // from-price, 1–49 tier (₦814,500 @ ₦1,500/$)
  family_residence: 283, // from-price, 1–5 tier (₦424,000 @ ₦1,500/$)
};

export const DEPOSIT_USD = 50;

// Paystack charges 3.9% (no cap) on USD/international cards. Gross up the charge so the
// customer covers the fee and ELAB nets the full deposit. e.g. $50 -> $52.03 charged.
const PAYSTACK_USD_FEE_RATE = 0.039;
export function grossUpForPaystack(net: number): number {
  return Math.round((net / (1 - PAYSTACK_USD_FEE_RATE)) * 100) / 100;
}

export function computeEstimatedTotal(visa: VisaType): number | null {
  return V1_PRICE_USD[visa] ?? null;
}

export function buildCaseRow(req: CaseRequest, candidateId: string) {
  return {
    candidate_id:         candidateId,
    lead_id:              req.lead_id,
    visa_type:            req.visa_type,
    status:               'deposit_pending' as const,
    sponsor_iqama:        req.sponsor_iqama,
    sponsor_name:         req.sponsor_name,
    travel_dates:         req.travel_dates,
    estimated_total_usd:  computeEstimatedTotal(req.visa_type),
    applicant_details:    req.applicant_details ?? null,
    sponsor_relationship: req.sponsor_relationship ?? null,
    travellers:           req.travellers ?? null,
  };
}

