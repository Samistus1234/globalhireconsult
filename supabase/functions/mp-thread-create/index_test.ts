import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateCreateBody } from './index.ts';

Deno.test('rejects a missing agency_id', () => {
  const r = validateCreateBody({ subject: 's', body: 'b', context_type: 'agency' });
  assertEquals(r.ok, false);
});

Deno.test('rejects an unknown context_type', () => {
  const r = validateCreateBody({ agency_id: 'a', subject: 's', body: 'b', context_type: 'nope' });
  assertEquals(r.ok, false);
});

Deno.test('rejects an empty body', () => {
  const r = validateCreateBody({ agency_id: 'a', subject: 's', body: '   ', context_type: 'agency' });
  assertEquals(r.ok, false);
});

Deno.test('ignores a client-supplied sender_side', () => {
  const r = validateCreateBody({ agency_id: 'a', subject: 's', body: 'b',
                                 context_type: 'agency', sender_side: 'gh' });
  assertEquals(r.ok, true);
  assertEquals(Object.hasOwn(r.value!, 'sender_side'), false);
});

Deno.test('accepts a valid body', () => {
  const r = validateCreateBody({ agency_id: 'a', subject: 's', body: 'b', context_type: 'agency' });
  assertEquals(r.ok, true);
  assertEquals(r.value!.context_id, null);
});
