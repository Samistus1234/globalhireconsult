/**
 * gh-email-shell — shared GlobalHire email chrome ("Navy & Gold", design B).
 *
 * stage-change-notify and welcome-applicant both import this so every outbound
 * email carries the same brand shell: a deep-navy letterhead with the white
 * lockup and a gold stage eyebrow, a serif display headline, a single navy
 * CTA, and a navy footer. Content stays data-driven — callers pass the stage
 * eyebrow, headline and escaped body HTML.
 *
 * Email-safe by construction: 600px tables, inline styles, system fonts
 * (Gmail / Outlook / Apple Mail). The logo is hotlinked from the site's own
 * static asset so it stays tiny (~16 KB, far under Gmail's 102 KB cap).
 */

export type AtAGlance = {
  employer: string;
  role: string;
  location: string;
  recruiter: string;
};

export type ShellProps = {
  logoUrl: string;
  eyebrow: string;      // gold letterspaced stage label in the navy band
  headline: string;     // serif display headline
  greeting: string;     // e.g. "Dear Amina," (already escaped)
  bodyHtml: string;     // escaped body HTML (intro + bullets and/or panel)
  closingHtml?: string; // escaped closing paragraph between gold rule and CTA
  ctaLabel: string;
  ctaUrl: string;
  quietHtml?: string;   // muted line under the CTA (defaults to portal link)
  footerSubtitle: string;
  footerLine2?: string;
};

const SANS = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const SERIF = "font-family:Georgia,'Times New Roman',serif;";

/** Gold-dot bullet list — each row hairline-separated except the last. */
export function renderBulletsHtml(bullets: string[]): string {
  return bullets
    .map((b, i) => {
      const isLast = i === bullets.length - 1;
      return (
        '<tr><td style="padding:12px 0 12px;' + SANS + 'font-size:14.5px;line-height:1.65;color:#334155;' +
        (isLast ? "" : "border-bottom:1px solid #EEF1F6;") + '">' +
        '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#C9A227;margin-right:12px;vertical-align:1px;"></span>' +
        b +
        "</td></tr>"
      );
    })
    .join("");
}

/** 2x2 "offer at a glance" panel — the milestone detail card. */
export function renderAtAGlance(p: AtAGlance): string {
  const cell = (label: string, value: string, extra: string) =>
    '<td style="padding:16px 20px;width:50%;' + extra + '">' +
    '<div style="' + SANS + 'font-size:10px;letter-spacing:.14em;color:#6B7A93;">' + label + "</div>" +
    '<div style="margin-top:4px;' + SANS + 'font-size:14.5px;color:#0F172A;font-weight:600;">' + value + "</div></td>";
  return (
    '<table role="presentation" width="100%" style="background:#F4F6FA;border:1px solid #E3E9F2;border-radius:10px;margin:4px 0 10px;">' +
    "<tr>" +
    cell(p.employer, "EMPLOYER", "") +
    cell(p.role, "ROLE", "border-left:1px solid #E3E9F2;") +
    "</tr>" +
    "<tr>" +
    cell(p.location, "LOCATION", "border-top:1px solid #E3E9F2;") +
    cell(p.recruiter, "YOUR RECRUITER", "border-top:1px solid #E3E9F2;border-left:1px solid #E3E9F2;") +
    "</tr>" +
    "</table>"
  );
}

/** Full design-B email document. */
export function buildEmailHtml(p: ShellProps): string {
  const quiet =
    p.quietHtml ??
    'Open your portal — <a href="' + p.ctaUrl + '" style="color:#0077B6;text-decoration:none;font-weight:600;">' + p.ctaUrl + "</a>";

  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>@media (max-width:600px){.gh-card{width:100%!important}.gh-pad{padding-left:28px!important;padding-right:28px!important}}</style>',
    "</head>",
    '<body style="margin:0;padding:0;background:#EEF1F5;' + SANS + 'color:#0F172A;">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F5;padding:40px 20px;"><tr><td align="center">',
    '<table width="600" class="gh-card" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #D8DEE8;border-radius:10px;overflow:hidden;">',

    // ── Navy letterhead: white lockup + gold rule + gold stage eyebrow ──
    '<tr><td style="background:#0A1F44;padding:40px 48px 30px;text-align:center;">',
    '<img src="' + p.logoUrl + '" width="168" style="width:168px;height:auto;display:block;margin:0 auto;" alt="GlobalHire Consult">',
    '<div style="width:52px;height:1px;background:#C9A227;margin:24px auto 15px;"></div>',
    '<div style="' + SANS + 'font-size:11px;font-weight:600;letter-spacing:.3em;color:#C9A227;">' + p.eyebrow + "</div>",
    "</td></tr>",

    // ── Body: serif headline, greeting, caller HTML, gold rule, closing, CTA ──
    '<tr><td class="gh-pad" style="padding:38px 48px 0;">',
    '<h1 style="margin:0 0 16px;' + SERIF + 'font-size:28px;line-height:1.3;color:#12224A;font-weight:400;">' + p.headline + "</h1>",
    '<p style="margin:0 0 18px;' + SANS + 'font-size:15px;color:#475569;">' + p.greeting + "</p>",
    p.bodyHtml,
    "</td></tr>",

    '<tr><td class="gh-pad" style="padding:10px 48px 0;">',
    '<div style="border-top:1px solid #C9A227;width:40px;"></div>',
    (p.closingHtml ? '<p style="margin:24px 0 0;' + SANS + 'font-size:14.5px;line-height:1.7;color:#475569;">' + p.closingHtml + "</p>" : ""),
    '<div style="margin-top:26px;">',
    '<a href="' + p.ctaUrl + '" style="display:inline-block;background:#0A1F44;color:#ffffff;' + SANS + 'font-size:15px;font-weight:700;padding:15px 34px;border-radius:6px;text-decoration:none;">' + p.ctaLabel + "</a>",
    "</div>",
    '<p style="margin:15px 0 0;' + SANS + 'font-size:13px;color:#8A97A8;">' + quiet + "</p>",
    "</td></tr>",

    // ── Navy footer ──
    '<tr><td style="background:#0A1F44;padding:22px 48px;text-align:center;">',
    '<p style="margin:0 0 3px;' + SANS + 'font-size:12px;color:#B9C7DF;">' + p.footerSubtitle + "</p>",
    '<p style="margin:0;' + SANS + 'font-size:11px;color:#6E7FA0;">' + (p.footerLine2 ?? "eLab Solutions International LLC · Riyadh · Doha · Abu Dhabi") + "</p>",
    "</td></tr>",

    "</table></td></tr></table></body></html>",
  ].join("\n");
}
