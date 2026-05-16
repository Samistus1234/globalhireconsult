// supabase/functions/_shared/visa-templates.ts
// Single source of truth for visa-state notification copy.
// Uses ELAB-owned voice ("From the ELAB Visa Services team").

export const TEMPLATE_KINDS = [
  'deposit-received',
  'intake-passed',
  'intake-needs-revision',
  'submitted-to-partner',
  'approved-balance-due',
  'issued-pdf-available',
  'rejected-with-refund',
] as const;

export type TemplateKind = typeof TEMPLATE_KINDS[number];

export interface TemplateVars {
  candidate_name: string;
  visa_label: string;       // "Family Visit", etc.
  case_url: string;         // dashboard-visa-case.html link
  revision_reason?: string;
  refund_reason?: string;
  partner_reference?: string;
  balance_amount_usd?: number;
  visa_pdf_url?: string;
}

export interface RenderedTemplate {
  email_subject: string;
  email_html:    string;
  whatsapp_text: string;
}

function shell(title: string, body: string, ctaLabel: string, ctaUrl: string): string {
  return [
    '<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">',
      '<h2 style="color:#0F1D32;">', title, '</h2>',
      body,
      '<p style="margin-top: 24px;">',
        '<a href="', ctaUrl, '" style="display:inline-block; padding:12px 20px; background:#0077B6; color:#fff; text-decoration:none; border-radius:6px;">', ctaLabel, '</a>',
      '</p>',
      '<p style="color:#5A7190; font-size:12px; margin-top:32px;">From the ELAB Visa Services team — in partnership with [Partner Name].</p>',
    '</div>',
  ].join('');
}

export function renderTemplate(kind: TemplateKind, v: TemplateVars): RenderedTemplate {
  switch (kind) {
    case 'deposit-received':
      return {
        email_subject: `${v.visa_label}: deposit received — case started`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>We've received your $50 deposit for your <strong>${v.visa_label}</strong> case. Our intake team will review your documents within 24 hours and let you know the next step.</p>`,
          'View case', v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, your $50 deposit for ${v.visa_label} is in. We'll review your documents within 24 hours. View case: ${v.case_url}`,
      };

    case 'intake-passed':
      return {
        email_subject: `${v.visa_label}: documents accepted — submitting to partner`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>Your documents for the <strong>${v.visa_label}</strong> case look good. We're submitting to our MoFA-licensed partner now. We'll update you when the partner acknowledges.</p>`,
          'View case', v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, your ${v.visa_label} documents are accepted. Submitting to our partner now. ${v.case_url}`,
      };

    case 'intake-needs-revision':
      return {
        email_subject: `${v.visa_label}: action needed on your documents`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>Our intake team needs an updated document on your <strong>${v.visa_label}</strong> case:</p>
           <p style="padding:12px; background:#FFF6E5; border-left:3px solid #F4A261;"><em>${v.revision_reason ?? ''}</em></p>
           <p>Please re-upload via your dashboard. We'll resume as soon as it's in.</p>`,
          'Re-upload now', v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, action needed on your ${v.visa_label} case: ${v.revision_reason ?? ''} Re-upload here: ${v.case_url}`,
      };

    case 'submitted-to-partner':
      return {
        email_subject: `${v.visa_label}: submitted to MoFA-licensed partner`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>Your <strong>${v.visa_label}</strong> case has been submitted to our partner${v.partner_reference ? ` (reference <code>${v.partner_reference}</code>)` : ''}. We'll keep you posted as the Saudi authorities process it.</p>`,
          'View case', v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, your ${v.visa_label} is now with our partner${v.partner_reference ? ` (ref ${v.partner_reference})` : ''}. ${v.case_url}`,
      };

    case 'approved-balance-due': {
      const amount = v.balance_amount_usd != null ? `$${v.balance_amount_usd}` : 'the balance';
      return {
        email_subject: `${v.visa_label}: approved — pay ${amount} to receive your visa`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>Great news — your <strong>${v.visa_label}</strong> has been approved. Pay ${amount} via your dashboard to receive your visa PDF.</p>`,
          `Pay ${amount}`, v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, your ${v.visa_label} is approved! Pay ${amount} to receive your visa: ${v.case_url}`,
      };
    }

    case 'issued-pdf-available':
      return {
        email_subject: `${v.visa_label}: issued — your visa PDF is ready`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>Your <strong>${v.visa_label}</strong> has been issued. Download the visa PDF from your dashboard. Print a colour copy and carry it with your passport.</p>`,
          'Download visa PDF', v.visa_pdf_url ?? v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, your ${v.visa_label} is issued. Download here: ${v.visa_pdf_url ?? v.case_url}`,
      };

    case 'rejected-with-refund':
      return {
        email_subject: `${v.visa_label}: case closed — refund processed`,
        email_html: shell(
          `Hi ${v.candidate_name},`,
          `<p>We're unable to proceed with your <strong>${v.visa_label}</strong> case.</p>
           <p style="padding:12px; background:#FFE5E5; border-left:3px solid #E63946;"><em>${v.refund_reason ?? 'Reason not specified.'}</em></p>
           <p>Per our refund policy, we've initiated the applicable refund. Please allow 5–10 business days. Reply to this email if you'd like to discuss alternatives.</p>`,
          'View case', v.case_url,
        ),
        whatsapp_text: `Hi ${v.candidate_name}, your ${v.visa_label} case is closed: ${v.refund_reason ?? ''} Refund initiated. ${v.case_url}`,
      };
  }
}
