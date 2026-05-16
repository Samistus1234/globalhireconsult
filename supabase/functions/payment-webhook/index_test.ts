import { assertEquals } from '@std/assert';
import { parsePaystackEvent } from './index.ts';

Deno.test('parsePaystackEvent extracts case_id and amount on charge.success', () => {
  const event = {
    event: 'charge.success',
    data: {
      amount: 5000, // kobo / USD-cents
      currency: 'USD',
      metadata: { case_id: 'case-123', kind: 'deposit' },
    },
  };
  const out = parsePaystackEvent(event);
  assertEquals(out, { case_id: 'case-123', kind: 'deposit', amount_usd: 50, currency: 'USD', ok: true });
});

Deno.test('parsePaystackEvent rejects non-success event', () => {
  const event = { event: 'charge.failed', data: { amount: 5000, metadata: { case_id: 'c-1', kind: 'deposit' } } };
  const out = parsePaystackEvent(event);
  assertEquals(out.ok, false);
});

Deno.test('parsePaystackEvent rejects missing metadata', () => {
  const event = { event: 'charge.success', data: { amount: 5000 } };
  const out = parsePaystackEvent(event);
  assertEquals(out.ok, false);
});
