// supabase/functions/submit-to-partner/index_test.ts
import { assertEquals, assertStringIncludes } from '@std/assert';
import { buildPartnerEmail, type PartnerPayload } from './index.ts';

Deno.test('buildPartnerEmail subject includes visa label and case ref', () => {
  const payload: PartnerPayload = {
    case_id: 'CASE-1', visa_label: 'Family Visit', candidate_name: 'Aisha Bello',
    passport_number: 'A12345678', sponsor_iqama: '2456789012', sponsor_name: 'Ibrahim Bello',
    travel_dates: { arrival: '2026-08-01', stay_days: 30 },
    contact_phone: '+234...', doc_links: [{ kind: 'passport_bio', url: 'https://x.test/d.pdf' }],
  };
  const out = buildPartnerEmail(payload);
  assertStringIncludes(out.subject, 'Family Visit');
  assertStringIncludes(out.subject, 'CASE-1');
  assertStringIncludes(out.html,    'Aisha Bello');
  assertStringIncludes(out.html,    'A12345678');
  assertStringIncludes(out.html,    'passport_bio');
  assertEquals(out.html.includes('on behalf of'), true);
});
