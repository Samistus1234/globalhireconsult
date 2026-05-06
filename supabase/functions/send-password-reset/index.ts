import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  send-password-reset — public endpoint. Generates a Supabase recovery
  link via the admin API (so we control the redirectTo and bypass the
  built-in mailer's per-project rate limits) and emails it through
  Gmail SMTP using the same transport pattern as
  send-consultation-message.

  Body: { email: string }

  Always responds with { ok: true } (even when the email is not in our
  user table) to avoid leaking which emails are registered.
*/

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
    const { email } = await req.json();
    if (!email || !String(email).trim()) {
      return json({ error: "email is required" }, 400);
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const SITE_URL =
      Deno.env.get("GLOBALHIRE_SITE_URL") ||
      Deno.env.get("SITE_URL") ||
      "https://globalhire.elabsolution.org";
    const redirectTo = `${SITE_URL}/login.html`;

    // Generate the recovery link via the admin API.
    // generateLink with type "recovery" returns an action_link without
    // sending Supabase's branded email — we send our own below.
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: "recovery",
      email: cleanEmail,
      options: { redirectTo },
    });

    // If the user does not exist, generateLink errors. We still return
    // ok: true so we don't reveal whether an email is registered.
    if (linkErr || !linkData?.properties?.action_link) {
      console.log("Reset skipped (user may not exist):", cleanEmail, linkErr?.message);
      return json({ ok: true });
    }

    const actionLink = linkData.properties.action_link;

    // ── Gmail SMTP ──
    const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
    const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");
    if (!smtpPass) return json({ error: "SMTP credentials not configured" }, 500);

    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const subject = "Reset your GlobalHire password";

    const plain = [
      "Hello,",
      "",
      "We received a request to reset the password on your GlobalHire account.",
      "Click the link below to set a new password. This link expires in 1 hour.",
      "",
      actionLink,
      "",
      "If you did not request a password reset, you can safely ignore this email — your password will not change.",
      "",
      "Best regards,",
      "eLab Solutions International",
      "www.elabsolution.org",
    ].join("\n");

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

      // Body
      '<tr><td style="padding:28px 40px 32px;">',
      '<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0F172A;">Reset your password</p>',
      '<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#475569;">We received a request to reset the password on your GlobalHire account. Click the button below to set a new password. This link will expire in 1 hour.</p>',

      // CTA
      '<div style="margin:24px 0;">',
      '<a href="' + actionLink + '" style="display:inline-block;padding:13px 32px;background:#0077B6;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">Reset my password</a>',
      '</div>',

      '<p style="margin:0 0 6px;font-size:12px;color:#94A3B8;">If the button does not work, copy and paste this URL into your browser:</p>',
      '<p style="margin:0 0 18px;font-size:12px;color:#475569;word-break:break-all;"><a href="' + actionLink + '" style="color:#0077B6;">' + actionLink + '</a></p>',

      '<p style="margin:0;font-size:13px;color:#64748B;line-height:1.6;">If you did not request a password reset, you can safely ignore this email — your password will not change.</p>',
      '</td></tr>',

      // Footer
      '<tr><td style="padding:20px 40px;border-top:1px solid #E2E8F0;text-align:center;">',
      '<p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">eLab Solutions International — Guaranteed Nursing Placement</p>',
      '<p style="margin:0;font-size:11px;color:#CBD5E1;"><a href="https://www.elabsolution.org" style="color:#CBD5E1;">www.elabsolution.org</a></p>',
      '</td></tr></table></td></tr></table></body></html>',
    ].join("\n");

    await transport.sendMail({
      from: '"GlobalHire" <' + smtpUser + '>',
      to: cleanEmail,
      subject,
      text: plain,
      html,
    });

    transport.close();

    return json({ ok: true });

  } catch (err) {
    console.error("send-password-reset error:", err);
    // Still return ok:true to avoid revealing system errors to public.
    return json({ ok: true });
  }
});
