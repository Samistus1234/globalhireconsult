import { assertEquals } from '@std/assert';
import { buildLeadRow, type WizardSubmission } from './index.ts';

Deno.test('buildLeadRow maps wizard outcome to visa type', () => {
  const sub: WizardSubmission = {
    outcome: 'bring-my-family',
    nationality: 'NG',
    sponsor_iqama: '2456789012',
    contact_email: 'a@b.com',
  };
  const row = buildLeadRow(sub, 'sess-123', { utm_source: 'meta' });
  assertEquals(row.outcome, 'bring-my-family');
  assertEquals(row.suggested_visa, 'family_visit');
  assertEquals(row.session_id, 'sess-123');
  assertEquals(row.utm_source, 'meta');
});

Deno.test('buildLeadRow handles unknown outcome with null suggested_visa', () => {
  const sub: WizardSubmission = { outcome: 'do-something-weird' };
  const row = buildLeadRow(sub, 'sess-x', {});
  assertEquals(row.suggested_visa, null);
});

Deno.test('buildLeadRow strips fields not in the schema', () => {
  // deno-lint-ignore no-explicit-any
  const sub = { outcome: 'visit-saudi', nationality: 'NG', evil: 'INJECTION' } as any;
  const row = buildLeadRow(sub, 'sess', {});
  assertEquals('evil' in row, false);
});
