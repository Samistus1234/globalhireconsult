import { assertEquals } from '@std/assert';
import { computeEstimatedTotal, buildCaseRow, type CaseRequest } from './index.ts';

Deno.test('computeEstimatedTotal: tourist evisa is 185', () => {
  assertEquals(computeEstimatedTotal('tourist'), 185);
});

Deno.test('computeEstimatedTotal: family_residence is 320', () => {
  assertEquals(computeEstimatedTotal('family_residence'), 320);
});

Deno.test('buildCaseRow copies allowed fields and stamps candidate_id', () => {
  const req: CaseRequest = {
    visa_type: 'family_visit',
    sponsor_iqama: '2456789012',
    sponsor_name: 'Ibrahim Bello',
    travel_dates: { arrival: '2026-08-01', stay_days: 30 },
    lead_id: 'lead-abc',
  };
  const row = buildCaseRow(req, 'user-123');
  assertEquals(row.candidate_id, 'user-123');
  assertEquals(row.sponsor_iqama, '2456789012');
  assertEquals(row.estimated_total_usd, 210);
  assertEquals(row.status, 'deposit_pending');
});

Deno.test('buildCaseRow rejects unknown visa types via undefined total', () => {
  const req = { visa_type: 'transit', sponsor_iqama: null, sponsor_name: null, travel_dates: null, lead_id: null } as CaseRequest;
  const row = buildCaseRow(req, 'user-1');
  // transit is not v1; total is null
  assertEquals(row.estimated_total_usd, null);
});
