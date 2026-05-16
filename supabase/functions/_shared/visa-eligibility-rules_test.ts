import { assertEquals, assertObjectMatch } from '@std/assert';
import { runEligibility, type EligibilityInput } from './visa-eligibility-rules.ts';

Deno.test('tourist eVisa: NG nationality with valid travel dates passes', () => {
  const input: EligibilityInput = {
    visa_type: 'tourist',
    nationality: 'NG',
    travel_dates: { arrival: '2026-08-01', stay_days: 14 },
  };
  const result = runEligibility(input);
  assertEquals(result.passed, true);
  assertEquals(result.reasons, []);
});

Deno.test('tourist eVisa: missing nationality fails with reason', () => {
  const input: EligibilityInput = { visa_type: 'tourist', travel_dates: { arrival: '2026-08-01' } };
  const result = runEligibility(input);
  assertEquals(result.passed, false);
  assertObjectMatch(result, { reasons: ['Nationality required for tourist eVisa eligibility check.'] });
});

Deno.test('umrah: missing nationality fails', () => {
  const result = runEligibility({ visa_type: 'umrah' });
  assertEquals(result.passed, false);
});

Deno.test('family_visit: requires sponsor_iqama', () => {
  const result = runEligibility({ visa_type: 'family_visit', nationality: 'NG' });
  assertEquals(result.passed, false);
  assertEquals(result.reasons.includes('Sponsor Iqama number required for Family Visit visa.'), true);
});

Deno.test('family_visit: passes with sponsor_iqama', () => {
  const result = runEligibility({
    visa_type: 'family_visit',
    nationality: 'NG',
    sponsor_iqama: '2456789012',
  });
  assertEquals(result.passed, true);
});

Deno.test('family_residence: requires sponsor_iqama AND relationship', () => {
  const noSponsor = runEligibility({ visa_type: 'family_residence', nationality: 'NG' });
  assertEquals(noSponsor.passed, false);

  const noRelationship = runEligibility({
    visa_type: 'family_residence',
    nationality: 'NG',
    sponsor_iqama: '2456789012',
  });
  assertEquals(noRelationship.passed, false);
  assertEquals(noRelationship.reasons.includes('Relationship to sponsor required for Family Residence.'), true);
});

Deno.test('family_residence: passes with full sponsor data', () => {
  const result = runEligibility({
    visa_type: 'family_residence',
    nationality: 'NG',
    sponsor_iqama: '2456789012',
    sponsor_relationship: 'spouse',
  });
  assertEquals(result.passed, true);
});

Deno.test('v2/v3 visa types return not_supported_yet', () => {
  const result = runEligibility({ visa_type: 'hajj', nationality: 'NG' });
  assertEquals(result.passed, false);
  assertEquals(result.reasons.includes('This visa type is not yet available — please contact us on WhatsApp.'), true);
});

Deno.test('all v1 types include passport_bio in missing docs', () => {
  for (const vt of ['tourist', 'umrah', 'family_visit', 'family_residence'] as const) {
    const result = runEligibility({ visa_type: vt, nationality: 'NG', sponsor_iqama: '2456789012', sponsor_relationship: 'spouse' });
    assertEquals(result.missingDocs.includes('passport_bio'), true, `missing for ${vt}`);
  }
});
