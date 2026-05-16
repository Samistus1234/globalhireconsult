// supabase/functions/notify-visa-status/index_test.ts
import { assertEquals } from '@std/assert';
import { stateToTemplateKind } from './index.ts';

Deno.test('stateToTemplateKind maps each state to a template (or null)', () => {
  assertEquals(stateToTemplateKind('intake_in_review'),     'deposit-received');
  assertEquals(stateToTemplateKind('docs_revision'),        'intake-needs-revision');
  assertEquals(stateToTemplateKind('submitted_to_partner'), 'submitted-to-partner');
  assertEquals(stateToTemplateKind('approved'),             'approved-balance-due');
  assertEquals(stateToTemplateKind('issued'),               'issued-pdf-available');
  assertEquals(stateToTemplateKind('rejected_intake'),      'rejected-with-refund');
  assertEquals(stateToTemplateKind('rejected_partner'),     'rejected-with-refund');
  assertEquals(stateToTemplateKind('refunded'),             'rejected-with-refund');
  assertEquals(stateToTemplateKind('lead'), null);
  assertEquals(stateToTemplateKind('deposit_pending'), null);
});
