import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateJobBody } from './index.ts';

const MINIMAL = { title: 'Staff Nurse — ICU' };

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
