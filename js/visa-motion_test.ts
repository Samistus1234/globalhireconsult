// js/visa-motion_test.ts
import { assertEquals } from 'jsr:@std/assert@^1.0.0';
import {
  shouldEnableMotion,
  shouldUseViewTransitions,
  animatePriceCounter,
} from './visa-motion.js';

Deno.test('shouldEnableMotion: false when reduced-motion=true', () => {
  assertEquals(shouldEnableMotion({ reducedMotion: true,  hasIO: true }), false);
});

Deno.test('shouldEnableMotion: false when IO unsupported', () => {
  assertEquals(shouldEnableMotion({ reducedMotion: false, hasIO: false }), false);
});

Deno.test('shouldEnableMotion: true when not reduced and IO supported', () => {
  assertEquals(shouldEnableMotion({ reducedMotion: false, hasIO: true }), true);
});

Deno.test('shouldUseViewTransitions: false if API missing', () => {
  assertEquals(shouldUseViewTransitions({ apiSupported: false, reducedMotion: false }), false);
});

Deno.test('shouldUseViewTransitions: false if reduced motion', () => {
  assertEquals(shouldUseViewTransitions({ apiSupported: true, reducedMotion: true }), false);
});

Deno.test('shouldUseViewTransitions: true if API supported and motion allowed', () => {
  assertEquals(shouldUseViewTransitions({ apiSupported: true, reducedMotion: false }), true);
});

Deno.test('animatePriceCounter: easeOutCubic interpolates monotonically and ends at target', () => {
  const values: number[] = [];
  animatePriceCounter({
    from: 0, to: 100, duration: 100,
    onTick: (v: number) => values.push(v),
    now: (i => () => i++ * 10)(0),  // simulated clock: 0, 10, 20, … ms
    deadline: 12,
  });
  // Final value clamps to target
  assertEquals(values[values.length - 1], 100);
  // Monotonically increasing
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[i-1]) throw new Error(`non-monotonic at ${i}: ${values[i]} < ${values[i-1]}`);
  }
});
