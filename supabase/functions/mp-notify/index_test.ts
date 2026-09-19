import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildNotification, escapeHtml, headerSafe } from './index.ts';

Deno.test('a gh message notifies the agency and links to the partner inbox', () => {
  const n = buildNotification('gh', 'Acme Recruit', 'Licence needed', 't1');
  assertEquals(n.type, 'new_message');
  assertStringIncludes(n.title, 'GlobalHire');
  assertEquals(n.link, 'partners-messages.html?thread=t1');
});

Deno.test('an agency message notifies staff and links to the admin inbox', () => {
  const n = buildNotification('agency', 'Acme Recruit', 'Licence needed', 't1');
  assertStringIncludes(n.title, 'Acme Recruit');
  assertEquals(n.link, 'admin-mp-messages.html?thread=t1');
});

Deno.test('the subject is carried into the body', () => {
  assertStringIncludes(buildNotification('gh', 'A', 'Licence needed', 't1').body, 'Licence needed');
});

// Extra test beyond the brief: type must be exactly 'new_message' or the
// mp_notifications CHECK constraint rejects the insert at write time.
Deno.test('buildNotification type is exactly new_message for both sides (CHECK constraint safety)', () => {
  assertEquals(buildNotification('gh', 'Acme Recruit', 'Licence needed', 't1').type, 'new_message');
  assertEquals(buildNotification('agency', 'Acme Recruit', 'Licence needed', 't1').type, 'new_message');
});

// Regression test for the HTML-injection fix: agency_name is free text from
// self-serve registration (mp-agency-register), reachable while the agency
// is still pending_verification. buildNotification's title must stay PLAIN
// (it's also the email subject header and mp_notifications.title, both
// non-HTML contexts the bell/mail client already escape on their own side),
// while escapeHtml — the boundary actually used at the buildEmailHtml call
// site in index.ts — must neutralize it before it reaches the HTML document.
Deno.test('agency name with HTML stays plain in title but is escaped at the HTML boundary', () => {
  const evil = '<img src=x onerror="alert(1)">';
  const n = buildNotification('agency', evil, 'Licence needed', 't1');

  // title is unescaped plain text — correct for subject: header / DB column.
  assertEquals(n.title, `New message from ${evil}`);
  assertStringIncludes(n.title, '<img');

  // what index.ts actually passes as `headline` to buildEmailHtml must be
  // the escaped form — the raw tag must not survive into the HTML document.
  const headline = escapeHtml(n.title);
  assertStringIncludes(headline, '&lt;img');
  assertEquals(headline.includes('<img'), false);
});

// Regression test for the header-injection fix: mp-agency-register only
// trims leading/trailing whitespace off agency_name, so an interior CRLF
// survives registration and lands in n.title, which reaches the email
// subject: header. Assert on the ABSENCE of CR/LF, not an exact collapsed
// string — an exact-string assertion breaks (and teaches nothing) the next
// time the collapse character changes.
Deno.test('a title with an embedded CRLF has no CR or LF left after headerSafe', () => {
  const evilName = 'Acme\r\nBcc: attacker@evil.com';
  const n = buildNotification('agency', evilName, 'Licence needed', 't1');

  // title itself stays raw (same reasoning as the HTML test above) — the
  // CRLF is still present here, proving the value IS attacker-reachable.
  assertStringIncludes(n.title, '\r\n');

  // what index.ts actually passes as subject: must be free of both.
  const safe = headerSafe(n.title);
  assertEquals(safe.includes('\r'), false);
  assertEquals(safe.includes('\n'), false);
});
