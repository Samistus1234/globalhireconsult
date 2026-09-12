import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildNotification } from './index.ts';

Deno.test('a gh message notifies the agency and links to the partner inbox', () => {
  const n = buildNotification('gh', 'Acme Recruit', 'Licence needed', 't1');
  assertEquals(n.type, 'new_message');
  assertStringIncludes(n.title, 'GlobalHire');
  assertEquals(n.link, 'partners-messages.html?thread=t1');
});

Deno.test('an agency message notifies staff and links to the admin inbox', () => {
  const n = buildNotification('agency', 'Acme Recruit', 'Licence needed', 't1');
  assertStringIncludes(n.title, 'Acme Recruit');
  assertEquals(n.link, 'admin-mp-messages.html?thread=t1');
});

Deno.test('the subject is carried into the body', () => {
  assertStringIncludes(buildNotification('gh', 'A', 'Licence needed', 't1').body, 'Licence needed');
});

// Extra test beyond the brief: type must be exactly 'new_message' or the
// mp_notifications CHECK constraint rejects the insert at write time.
Deno.test('buildNotification type is exactly new_message for both sides (CHECK constraint safety)', () => {
  assertEquals(buildNotification('gh', 'Acme Recruit', 'Licence needed', 't1').type, 'new_message');
  assertEquals(buildNotification('agency', 'Acme Recruit', 'Licence needed', 't1').type, 'new_message');
});
