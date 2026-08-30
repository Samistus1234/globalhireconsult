import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  welcome-applicant — Called from landing pages after signUp + doc upload.
  Sends a branded welcome email with a password-reset link via Gmail SMTP.

  Body: { email: string, name: string, source?: string }
  No auth required (called from public landing pages).
  Uses service role key to generate a password recovery link.

  Variants are selected by `source`:
    - app-signup  (main portal signup)          → "account ready" copy (no docs yet)
    - tech-*      (e.g. tech-careers-middle-east)  → tech recruitment copy
    - everything else                           → healthcare default
*/

type Variant = {
  badgeText: string;
  badgeColor: string;     // hex
  introPara: string;      // sentence 1 (HTML allowed)
  setupPara: string;      // sentence 2 (HTML allowed) — leads into CTA
  footerSubtitle: string; // bottom-of-email tagline
  subject: string;
};

const HEALTHCARE_LABELS: Record<string, string> = {
  "albania-work-visa":  "Albania Work Visa",
  "saudi-ent-surgeon":  "Saudi ENT Surgeon Placement",
  "saudi-fast-track":   "Saudi Fast Track",
  "qatar-caregivers":   "Qatar Caregivers",
};

function variantFor(source: string | undefined): Variant {
  // ── Main portal signup: account ready, docs come later ──
  if (source === "app-signup") {
    return {
      badgeText: "WELCOME",
      badgeColor: "#2EC4B6",
      introPara:
        'Your GlobalHire account is ready — complete your profile and upload your documents in your portal to get started.',
      setupPara:
        'Click the button below to <strong style="color:#0F172A;">set your password</strong> and access your portal, where you can complete your profile, upload documents, and track your application at every stage.',
      footerSubtitle: "GlobalHire@eLab — International Healthcare Recruitment",
      subject: "Welcome to GlobalHire — Let's Get You Started",
    };
  }

  // ── Tech recruitment branch ──
  if (source && source.startsWith("tech-")) {
    return {
      badgeText: "APPLICATION RECEIVED",
      badgeColor: "#0077B6",
      introPara:
        'Thank you for applying through Global Hire for senior technology roles in the Middle East. ' +
        'We have received your CV, and our recruitment desk reviews every application — you can expect a ' +
        'response within 72 hours on confirmed-fit profiles.',
      setupPara:
        'We\'ve created your Global Hire portal account. Click the button below to ' +
        '<strong style="color:#0F172A;">set your password</strong> and access your portal, ' +
        'where you can track this application and submit additional materials at any time.',
      footerSubtitle: "Global Hire — International Recruitment",
      subject: "Welcome to Global Hire — Set Your Password",
    };
  }

  // ── Healthcare default (preserves existing behaviour) ──
  const label = HEALTHCARE_LABELS[source ?? ""] ?? "GlobalHire";
  return {
    badgeText: "DOCUMENTS RECEIVED",
    badgeColor: "#2EC4B6",
    introPara:
      'Thank you for applying to the <strong style="color:#0F172A;">' + esc(label) + '</strong> program. ' +
      'We have received your documents and our team will review them within 48 hours.',
    setupPara:
      'We\'ve created your GlobalHire portal account. Click the button below to ' +
      '<strong style="color:#0F172A;">set your password</strong> and access your portal where you can ' +
      'track your application and manage your documents.',
    footerSubtitle: "GlobalHire@eLab — International Healthcare Recruitment",
    subject: "Welcome to GlobalHire — Set Your Password",
  };
}

function buildEmail(applicantName: string, resetLink: string, portalOrigin: string, v: Variant): { html: string; text: string } {
  const safeName = esc(applicantName);

  const html = [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background:#F0F4F8;font-family:Segoe UI,Roboto,Helvetica Neue,sans-serif;color:#0F172A;">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:40px 20px;"><tr><td align="center">',
    '<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">',

    // Header
    '<tr><td style="padding:28px 40px 20px;border-bottom:1px solid #E2E8F0;"><table width="100%"><tr>',
    '<td><span style="display:inline-block;width:34px;height:34px;background:#0077B6;border-radius:8px;text-align:center;line-height:34px;font-weight:800;color:#fff;font-size:14px;">G</span></td>',
    '<td style="padding-left:12px;font-size:18px;font-weight:800;color:#0F172A;letter-spacing:-0.3px;">Global<span style="color:#0077B6;">Hire</span></td>',
    '</tr></table></td></tr>',

    // Badge
    '<tr><td style="padding:24px 40px 0;"><span style="display:inline-block;padding:5px 14px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:1px;color:' + v.badgeColor + ';background:' + v.badgeColor + '15;border:1px solid ' + v.badgeColor + '30;">' + v.badgeText + '</span></td></tr>',

    // Body
    '<tr><td style="padding:20px 40px 32px;">',
    '<p style="margin:0 0 20px;font-size:15px;color:#475569;">Hi <strong style="color:#0F172A;">' + safeName + '</strong>,</p>',
    '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">' + v.introPara + '</p>',
    '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">' + v.setupPara + '</p>',

    // CTA Button
    '<div style="margin:28px 0;">',
    '<a href="' + resetLink + '" style="display:inline-block;padding:14px 36px;background:#0077B6;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">Set Your Password & Access Portal</a>',
    '</div>',

    '<p style="margin:0 0 8px;font-size:13px;color:#94A3B8;">This link expires in 24 hours. If it expires, go to the login page and click "Forgot Password" to get a new link.</p>',
    '<p style="margin:0 0 0;font-size:13px;color:#94A3B8;">Portal: <a href="' + portalOrigin + '/login.html" style="color:#0077B6;">' + portalOrigin + '/login.html</a></p>',

    '</td></tr>',

    // Footer
    '<tr><td style="padding:20px 40px;border-top:1px solid #E2E8F0;text-align:center;">',
    '<p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">' + v.footerSubtitle + '</p>',
    '<p style="margin:0;font-size:11px;color:#CBD5E1;">eLab Solutions International LLC</p>',
    '</td></tr></table></td></tr></table></body></html>',
  ].join("\n");

  const stripTags = (s: string) =>
    s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  const text =
    `Hi ${applicantName},\n\n` +
    `${stripTags(v.introPara)}\n\n` +
    `${stripTags(v.setupPara)}\n\n` +
    `Set your password and access your portal:\n${resetLink}\n\n` +
    `This link expires in 24 hours.\n\n` +
    `— ${stripTags(v.footerSubtitle)}`;

  return { html, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { email, name, source } = await req.json();
    if (!email) return json({ error: "email is required" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Generate a password recovery link (valid for 24h by default)
    const portalOrigin = Deno.env.get("SITE_URL") || "https://globalhire.elabsolution.org";
    const { data: linkData, error: linkError } = await sb.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: portalOrigin + "/login.html" },
    });

    if (linkError) {
      console.error("generateLink error:", linkError);
      return json({ error: "Failed to generate recovery link" }, 500);
    }

    const resetLink = linkData?.properties?.action_link;
    if (!resetLink) {
      return json({ error: "No recovery link generated" }, 500);
    }

    // ── Pick variant + build email ──
    const applicantName = name || "there";
    const variant = variantFor(source);
    const { html, text } = buildEmail(applicantName, resetLink, portalOrigin, variant);

    // ── Send via Gmail SMTP ──
    const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
    const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");
    if (!smtpPass) return json({ error: "SMTP credentials not configured" }, 500);

    const fromName = source && source.startsWith("tech-") ? "Global Hire" : "GlobalHire@eLab";

    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transport.sendMail({
      from: '"' + fromName + '" <' + smtpUser + '>',
      to: email,
      subject: variant.subject,
      text,
      html,
    });

    transport.close();

    return json({ success: true, sent_to: email, variant: source ?? "healthcare" });

  } catch (err) {
    console.error("welcome-applicant error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
