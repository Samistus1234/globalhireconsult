import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { parseAgencyFromPath } from './index.ts';

const AG = 'aaaaaaaa-0000-0000-0000-00000000000a';

Deno.test('extracts the agency id', () => {
  assertEquals(parseAgencyFromPath(`marketplace/agency/${AG}/thread/m1/x.pdf`), AG);
});

Deno.test('returns null for a non-marketplace path', () => {
  assertEquals(parseAgencyFromPath('recruiter-clients/abc/x.pdf'), null);
});

Deno.test('returns null for a traversal attempt', () => {
  assertEquals(parseAgencyFromPath(`marketplace/agency/${AG}/../x.pdf`), null);
});

Deno.test('returns null for a too-short path', () => {
  assertEquals(parseAgencyFromPath('marketplace/agency'), null);
});

// Additional adversarial cases beyond the brief.

Deno.test('returns null for an empty third segment', () => {
  assertEquals(parseAgencyFromPath('marketplace/agency//thread/x.pdf'), null);
});

Deno.test('returns null for a path that merely starts with the right words but differs in structure', () => {
  assertEquals(parseAgencyFromPath(`marketplacex/agency/${AG}/f.pdf`), null);
});
