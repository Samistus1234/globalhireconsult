import { assertEquals, assert } from '@std/assert';
import { validateInviteBody, inviteExpiry } from './index.ts';

Deno.test('validateInviteBody: email + role in {admin,member}', () => {
  assertEquals(validateInviteBody({ email: 'a@b.com', role: 'member' }).ok, true);
  assertEquals(validateInviteBody({ email: 'a@b.com', role: 'owner' }).ok, false);
  assertEquals(validateInviteBody({ role: 'member' }).ok, false);
});

Deno.test('inviteExpiry: ~14 days out', () => {
  const days = (inviteExpiry().getTime() - Date.now()) / 86_400_000;
  assert(days > 13.5 && days < 14.5);
});
