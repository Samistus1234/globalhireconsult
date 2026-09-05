import { assertEquals } from '@std/assert';
import { validateVerifyBody } from './index.ts';

Deno.test('validateVerifyBody: needs agency_id + known action', () => {
  assertEquals(validateVerifyBody({}).ok, false);
  assertEquals(validateVerifyBody({ agency_id: 'x', action: 'bogus' }).ok, false);
  assertEquals(validateVerifyBody({ agency_id: 'x', action: 'verify' }).ok, true);
});

Deno.test('validateVerifyBody: maps action to target status', () => {
  assertEquals(validateVerifyBody({ agency_id: 'x', action: 'verify' }).value?.status, 'verified');
  assertEquals(validateVerifyBody({ agency_id: 'x', action: 'reject' }).value?.status, 'rejected');
  assertEquals(validateVerifyBody({ agency_id: 'x', action: 'suspend' }).value?.status, 'suspended');
});
