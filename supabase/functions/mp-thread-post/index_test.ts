import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validatePostBody, attachmentsInsideAgency } from './index.ts';

const AG = 'aaaaaaaa-0000-0000-0000-00000000000a';

Deno.test('rejects a missing thread_id', () => {
  assertEquals(validatePostBody({ body: 'hi' }).ok, false);
});

Deno.test('rejects an empty body', () => {
  assertEquals(validatePostBody({ thread_id: 't', body: '  ' }).ok, false);
});

Deno.test('accepts a valid body', () => {
  const r = validatePostBody({ thread_id: 't', body: 'hi' });
  assertEquals(r.ok, true);
  assertEquals(r.value!.attachments.length, 0);
});

Deno.test('accepts an attachment inside the agency prefix', () => {
  assertEquals(attachmentsInsideAgency(
    [{ path: `marketplace/agency/${AG}/thread/m1/licence.pdf` }], AG), true);
});

Deno.test('rejects an attachment pointing at another agency', () => {
  assertEquals(attachmentsInsideAgency(
    [{ path: 'marketplace/agency/bbbbbbbb-0000-0000-0000-00000000000b/thread/m1/x.pdf' }], AG), false);
});

Deno.test('rejects a traversal attempt', () => {
  assertEquals(attachmentsInsideAgency(
    [{ path: `marketplace/agency/${AG}/../../recruiter-clients/x/secret.pdf` }], AG), false);
});
