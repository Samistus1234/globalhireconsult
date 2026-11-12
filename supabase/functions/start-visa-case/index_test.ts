import { assertEquals } from '@std/assert';
import {
  computeEstimatedTotal, buildCaseRow, type CaseRequest,
  sanitizeApplicant, sanitizeRelationship, sanitizeTravellers,
} from './case-row.ts';

Deno.test('computeEstimatedTotal: tourist evisa is 185', () => {
  assertEquals(computeEstimatedTotal('tourist'), 185);
});

Deno.test('computeEstimatedTotal: family_residence from-price is 283', () => {
  assertEquals(computeEstimatedTotal('family_residence'), 283);
});

Deno.test('buildCaseRow copies allowed fields and stamps candidate_id', () => {
  const req: CaseRequest = {
    visa_type: 'family_visit',
    sponsor_iqama: '2456789012',
    sponsor_name: 'Ibrahim Bello',
    travel_dates: { arrival: '2026-08-01', stay_days: 30 },
    lead_id: 'lead-abc',
    applicant_details: { passport_number: 'A12345678', nationality: 'Nigeria', whatsapp: '+2348012345678' },
    sponsor_relationship: ['spouse'],
    travellers: { people: 1, currency: 'NGN', total: 844500, counts: { a: 1 }, lines: [['1 × Ages 1–49', '₦814,500']] },
  };
  const row = buildCaseRow(req, 'user-123');
  assertEquals(row.candidate_id, 'user-123');
  assertEquals(row.sponsor_iqama, '2456789012');
  assertEquals(row.estimated_total_usd, 543);
  assertEquals(row.status, 'deposit_pending');
  assertEquals(row.applicant_details?.passport_number, 'A12345678');
  assertEquals(row.sponsor_relationship, ['spouse']);
  assertEquals(row.travellers?.people, 1);
});

Deno.test('buildCaseRow rejects unknown visa types via undefined total', () => {
  const req = { visa_type: 'transit', sponsor_iqama: null, sponsor_name: null, travel_dates: null, lead_id: null } as CaseRequest;
  const row = buildCaseRow(req, 'user-1');
  assertEquals(row.estimated_total_usd, null);
  assertEquals(row.applicant_details, null);
});

Deno.test('sanitizeApplicant trims, uppercases passport and drops junk', () => {
  assertEquals(
    sanitizeApplicant({ passport_number: ' a1234 5678 ', nationality: ' Nigeria ', whatsapp: '+234 801-234-5678', extra: 'x' }),
    { passport_number: 'A12345678', nationality: 'Nigeria', whatsapp: '+234 801-234-5678' },
  );
});

Deno.test('sanitizeApplicant returns null when nothing usable', () => {
  assertEquals(sanitizeApplicant(null), null);
  assertEquals(sanitizeApplicant({ passport_number: '', nationality: '   ' }), null);
  assertEquals(sanitizeApplicant('A123'), null);
});

Deno.test('sanitizeApplicant caps lengths and rejects bad characters', () => {
  const out = sanitizeApplicant({ passport_number: 'A1<script>', nationality: 'x'.repeat(200), whatsapp: 'call me' });
  assertEquals(out?.passport_number, null);
  assertEquals(out?.nationality?.length, 60);
  assertEquals(out?.whatsapp, null);
});

Deno.test('sanitizeRelationship keeps known values once, in order', () => {
  assertEquals(sanitizeRelationship(['spouse', 'child', 'spouse', 'boss']), ['spouse', 'child']);
  assertEquals(sanitizeRelationship('parent'), ['parent']);
  assertEquals(sanitizeRelationship([]), null);
  assertEquals(sanitizeRelationship(42), null);
});

Deno.test('sanitizeTravellers keeps a bounded, typed copy', () => {
  const t = sanitizeTravellers({
    people: 3, currency: 'NGN', total: 2503500,
    counts: { a: 2, b: 1, zz: 'x', c: -4 },
    lines: [['2 × Ages 1–49', '₦1,629,000'], ['<b>x</b>', 5], 'junk'],
    hacker: true,
  });
  assertEquals(t, {
    people: 3, currency: 'NGN', total: 2503500,
    counts: { a: 2, b: 1 },
    lines: [['2 × Ages 1–49', '₦1,629,000'], ['<b>x</b>', '5']],
  });
});

Deno.test('sanitizeTravellers rejects nonsense', () => {
  assertEquals(sanitizeTravellers(null), null);
  assertEquals(sanitizeTravellers({ people: 0 }), null);
  assertEquals(sanitizeTravellers({ people: 500, currency: 'NGN', total: 1 }), null);
  assertEquals(sanitizeTravellers({ people: 2, currency: 'EUR', total: 10 })?.currency, null);
});
