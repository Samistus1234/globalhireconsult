import { assertEquals } from '@std/assert';
import { ALLOWED_ACTIONS } from './index.ts';

Deno.test('ALLOWED_ACTIONS lists exactly the v1 admin actions', () => {
  assertEquals([...ALLOWED_ACTIONS].sort(), [
    'accept_doc',
    'mark_issued',
    'refund',
    'reject_doc',
    'reject_intake',
    'request_revision',
  ].sort());
});
