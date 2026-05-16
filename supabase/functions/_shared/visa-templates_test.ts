// supabase/functions/_shared/visa-templates_test.ts
import { assertEquals, assertStringIncludes } from '@std/assert';
import { renderTemplate, TEMPLATE_KINDS } from './visa-templates.ts';

Deno.test('all template kinds are defined', () => {
  for (const kind of TEMPLATE_KINDS) {
    const out = renderTemplate(kind, { candidate_name: 'Aisha', visa_label: 'Family Visit', case_url: 'https://x.test/case' });
    assertEquals(typeof out.email_subject, 'string');
    assertEquals(typeof out.email_html, 'string');
    assertEquals(typeof out.whatsapp_text, 'string');
  }
});

Deno.test('deposit-received uses the candidate name and visa label', () => {
  const out = renderTemplate('deposit-received', { candidate_name: 'Aisha', visa_label: 'Family Visit', case_url: 'https://x.test/case' });
  assertStringIncludes(out.email_subject, 'Family Visit');
  assertStringIncludes(out.email_html, 'Aisha');
  assertStringIncludes(out.whatsapp_text, 'Aisha');
  assertStringIncludes(out.whatsapp_text, 'https://x.test/case');
});

Deno.test('intake-needs-revision includes a reason placeholder', () => {
  const out = renderTemplate('intake-needs-revision', {
    candidate_name: 'Aisha', visa_label: 'Family Visit', case_url: 'https://x.test/c',
    revision_reason: 'Sponsor Iqama image is blurred.',
  });
  assertStringIncludes(out.email_html, 'Sponsor Iqama image is blurred.');
  assertStringIncludes(out.whatsapp_text, 'Sponsor Iqama image is blurred.');
});
