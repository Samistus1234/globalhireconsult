import { assertEquals, assert } from '@std/assert';
import { estimateCostUsd, isAiEnabled } from './mp-ai.ts';

Deno.test('isAiEnabled: false when MP_AI_ENABLED unset', () => {
  Deno.env.delete('MP_AI_ENABLED');
  assertEquals(isAiEnabled(), false);
});

Deno.test('isAiEnabled: true only for the literal "true"', () => {
  Deno.env.set('MP_AI_ENABLED', 'true');
  assertEquals(isAiEnabled(), true);
  Deno.env.set('MP_AI_ENABLED', 'TRUE');
  assertEquals(isAiEnabled(), false);
});

Deno.test('estimateCostUsd: sonnet pricing, positive and scales with tokens', () => {
  const a = estimateCostUsd('claude-sonnet-4-20250514', 1000, 500);
  const b = estimateCostUsd('claude-sonnet-4-20250514', 2000, 1000);
  assert(a > 0);
  assertEquals(Math.round(b / a), 2);
});
