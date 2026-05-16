// supabase/functions/partner-status-sync/index_test.ts
import { assertEquals } from '@std/assert';
import { mapPartnerStatus } from './index.ts';

Deno.test('partner status mapping', () => {
  assertEquals(mapPartnerStatus('acknowledged'), 'partner_processing');
  assertEquals(mapPartnerStatus('approved'),     'approved');
  assertEquals(mapPartnerStatus('issued'),       'issued');
  assertEquals(mapPartnerStatus('rejected'),     'rejected_partner');
  assertEquals(mapPartnerStatus('unknown_value'), null);
});
