import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateJobBody, buildJobPatch } from './index.ts';

const MINIMAL = { title: 'Staff Nurse — ICU' };
const JOB_ID = 'aaaaaaaa-0000-0000-0000-00000000000a';

Deno.test('rejects a missing title', () => {
  const r = validateJobBody({ contract_type: 'permanent' });
  assertEquals(r.ok, false);
});

Deno.test('rejects an unknown contract_type', () => {
  const r = validateJobBody({ title: 'Staff Nurse', contract_type: 'freelance' });
  assertEquals(r.ok, false);
});

Deno.test('rejects an unknown status', () => {
  const r = validateJobBody({ title: 'Staff Nurse', status: 'archived' });
  assertEquals(r.ok, false);
});

Deno.test('rejects partner_split_pct above 100', () => {
  const r = validateJobBody({ title: 'Staff Nurse', partner_split_pct: 101 });
  assertEquals(r.ok, false);
});

Deno.test('rejects partner_split_pct below 0', () => {
  const r = validateJobBody({ title: 'Staff Nurse', partner_split_pct: -1 });
  assertEquals(r.ok, false);
});

Deno.test('rejects positions_count of 0', () => {
  const r = validateJobBody({ title: 'Staff Nurse', positions_count: 0 });
  assertEquals(r.ok, false);
});

Deno.test('builds its result field by field — unexpected keys cannot reach the insert', () => {
  const r = validateJobBody({
    ...MINIMAL,
    posted_by: 'aaaaaaaa-0000-0000-0000-00000000000a',
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-01T00:00:00Z',
    published_at: '2020-01-01T00:00:00Z',
    some_unknown_field: 'nope',
  });
  assertEquals(r.ok, true);
  assertEquals(Object.hasOwn(r.value!, 'posted_by'), false);
  assertEquals(Object.hasOwn(r.value!, 'created_at'), false);
  assertEquals(Object.hasOwn(r.value!, 'updated_at'), false);
  assertEquals(Object.hasOwn(r.value!, 'published_at'), false);
  assertEquals(Object.hasOwn(r.value!, 'some_unknown_field'), false);
});

Deno.test('accepts a minimal valid body', () => {
  const r = validateJobBody(MINIMAL);
  assertEquals(r.ok, true);
  assertEquals(r.value!.title, 'Staff Nurse — ICU');
  assertEquals(r.value!.status, 'draft');
  assertEquals(r.value!.positions_count, 1);
  assertEquals(r.value!.partner_split_pct, 50);
  assertEquals(r.value!.contract_type, null);
});

// Regression guard for the "80,000" silent-null bug: a typo'd or comma-formatted salary must be
// REJECTED with a readable 400 naming the field, never silently coerced to null and saved as if
// nothing was wrong.
Deno.test('rejects salary_min "80,000" (comma-formatted, not hostile — just how salaries are typed)', () => {
  const r = validateJobBody({ ...MINIMAL, salary_min: '80,000' });
  assertEquals(r.ok, false);
  assertEquals((r as { error: string }).error.includes('salary_min'), true);
});

Deno.test('rejects salary_min "abc"', () => {
  const r = validateJobBody({ ...MINIMAL, salary_min: 'abc' });
  assertEquals(r.ok, false);
  assertEquals((r as { error: string }).error.includes('salary_min'), true);
});

Deno.test('salary_min "" and salary_min absent both still produce null and still pass', () => {
  const withEmpty = validateJobBody({ ...MINIMAL, salary_min: '' });
  assertEquals(withEmpty.ok, true);
  assertEquals(withEmpty.value!.salary_min, null);

  const withAbsent = validateJobBody({ ...MINIMAL });
  assertEquals(withAbsent.ok, true);
  assertEquals(withAbsent.value!.salary_min, null);
});

Deno.test('a valid numeric string salary_min "80000" still parses to the number 80000', () => {
  const r = validateJobBody({ ...MINIMAL, salary_min: '80000' });
  assertEquals(r.ok, true);
  assertEquals(r.value!.salary_min, 80000);
});

// --- Insert vs. partial-update patch semantics --------------------------------------------
// This function is the ONLY write path to mp_jobs. A partial update body must never be able to
// blank out every column it didn't resend (the fix for the data-loss shape found building the
// admin page on top of this function).

Deno.test('a body with no id still produces the full insert shape', () => {
  const r = validateJobBody({ title: 'Staff Nurse — ICU', status: 'open' });
  assertEquals(r.ok, true);
  const expectedKeys = [
    'title', 'employer_name', 'employer_confidential', 'destination_country', 'city',
    'specialty', 'subspecialty', 'seniority_level', 'contract_type', 'facility_type',
    'positions_count', 'salary_min', 'salary_max', 'salary_currency', 'salary_display',
    'benefits', 'jd_text', 'status', 'placement_fee_amount', 'placement_fee_currency',
    'partner_split_pct', 'source', 'origin_campaign_id', 'min_experience_years',
    'required_licences', 'required_exams', 'nationality_prefs', 'gender_pref', 'age_min',
    'age_max', 'language_reqs', 'extra_criteria', 'closes_at',
  ];
  for (const key of expectedKeys) assertEquals(Object.hasOwn(r.value!, key), true, `missing ${key}`);
  // No id in the request -> no id on the validated value either (insert path, DB generates one).
  assertEquals(Object.hasOwn(r.value!, 'id'), false);
});

Deno.test('{id, status:"open"} produces a patch containing ONLY status — not title', () => {
  const raw = { id: JOB_ID, status: 'open' };
  const r = validateJobBody(raw);
  assertEquals(r.ok, true);
  const patch = buildJobPatch(raw, r.value!);
  assertEquals(patch.status, 'open');
  assertEquals(Object.hasOwn(patch, 'title'), false);
  assertEquals(Object.hasOwn(patch, 'salary_min'), false);
  assertEquals(Object.hasOwn(patch, 'positions_count'), false);
  assertEquals(Object.hasOwn(patch, 'id'), false);
});

Deno.test('{id, salary_min: null} produces a patch that DOES include salary_min, clearing it', () => {
  const raw = { id: JOB_ID, salary_min: null };
  const r = validateJobBody(raw);
  assertEquals(r.ok, true);
  const patch = buildJobPatch(raw, r.value!);
  assertEquals(Object.hasOwn(patch, 'salary_min'), true);
  assertEquals(patch.salary_min, null);
  // Nothing else the caller didn't send should be in the patch.
  assertEquals(Object.hasOwn(patch, 'title'), false);
});

Deno.test('{id, salary_min: "80,000"} is still rejected with the field-naming 400', () => {
  const raw = { id: JOB_ID, salary_min: '80,000' };
  const r = validateJobBody(raw);
  assertEquals(r.ok, false);
  assertEquals((r as { error: string }).error.includes('salary_min'), true);
});
