import { assertEquals } from '@std/assert';
import { validateRegisterBody } from './index.ts';

Deno.test('validateRegisterBody: rejects missing required fields', () => {
  assertEquals(validateRegisterBody({}).ok, false);
  assertEquals(validateRegisterBody({ full_name: 'A', email: 'a@b.com' }).ok, false); // no password/agency
});

Deno.test('validateRegisterBody: accepts a complete body and normalises email', () => {
  const r = validateRegisterBody({
    full_name: ' Jane ', email: '  JANE@AGENCY.COM ', password: 'xxxxxxxx', agency_name: 'Jane Agency',
  });
  assertEquals(r.ok, true);
  assertEquals(r.value?.email, 'jane@agency.com');
  assertEquals(r.value?.full_name, 'Jane');
});

Deno.test('validateRegisterBody: rejects short password', () => {
  assertEquals(validateRegisterBody({
    full_name: 'J', email: 'j@a.com', password: 'short', agency_name: 'X',
  }).ok, false);
});
