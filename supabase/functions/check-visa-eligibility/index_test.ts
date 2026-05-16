import { assertEquals } from '@std/assert';
import { extractEligibilityInput } from './index.ts';

Deno.test('extractEligibilityInput coerces visa_type and copies allowed fields', () => {
  const out = extractEligibilityInput({
    visa_type: 'family_visit',
    nationality: 'NG',
    sponsor_iqama: '2456789012',
    sponsor_relationship: 'spouse',
    travel_dates: { arrival: '2026-08-01', stay_days: 30 },
    junk: 'ignored',
  });
  assertEquals(out.visa_type, 'family_visit');
  assertEquals(out.sponsor_relationship, 'spouse');
  assertEquals(out.travel_dates?.stay_days, 30);
  // deno-lint-ignore no-explicit-any
  assertEquals((out as any).junk, undefined);
});

Deno.test('extractEligibilityInput throws on missing visa_type', () => {
  let threw = false;
  try { extractEligibilityInput({ nationality: 'NG' }); } catch { threw = true; }
  assertEquals(threw, true);
});
