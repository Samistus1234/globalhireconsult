import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  send-consultation-message — admin-only. Sends an ad-hoc email to a
  candidate from the eLab Complete admin page (e.g. "please send your
  international passport") and logs the send to elab_complete_messages.

  Body: {
    consultation_id: string (uuid),
    subject: string,
    body: string,           // plain-text body, newlines preserved
    template_key?: string   // 'passport' | 'cv' | 'education_cert' | 'reference_letter' | 'custom'
  }
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
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: adminProfile } = await sb
      .from("gh_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!adminProfile || adminProfile.role !== "admin") {
      return json({ error: "Admin access required" }, 403);
    }

    // ── Parse ──
    const { consultation_id, subject, body, template_key } = await req.json();

    if (!consultation_id) return json({ error: "consultation_id is required" }, 400);
    if (!subject || !String(subject).trim()) return json({ error: "subject is required" }, 400);
    if (!body || !String(body).trim()) return json({ error: "body is required" }, 400);

    // ── Load consultation for the recipient ──
    const { data: existing, error: loadErr } = await sb
      .from("elab_complete_consultations")
      .select("id, full_name, email, preferred_destination")
      .eq("id", consultation_id)
      .single();

    if (loadErr || !existing) {
      console.error("Load error:", loadErr);
      return json({ error: "Consultation not found" }, 404);
    }
    if (!existing.email) {
      return json({ error: "Consultation has no email on file" }, 400);
    }

    const fullName = existing.full_name || "there";
    const trimmedSubject = String(subject).trim();
    const trimmedBody = String(body).trim();

    // ── Build email ──
    const greeting = `Dear ${fullName},`;
    const signoff = [
      "Best regards,",
      "eLab Solutions International",
      "www.elabsolution.org",
    ].join("\n");

    const candidatePlain = [
      greeting,
      "",
      trimmedBody,
      "",
      "If you have any questions, reply to this email or message us on WhatsApp at +1 (929) 419-2327.",
      "",
      signoff,
    ].join("\n");

    const bodyHtml = esc(trimmedBody).replace(/\n/g, "<br>");

    const candidateHtml = [
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
      '<body style="margin:0;padding:0;background:#F0F4F8;font-family:Segoe UI,Roboto,Helvetica Neue,sans-serif;color:#0F172A;">',
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:40px 20px;"><tr><td align="center">',
      '<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">',

      // Header
      '<tr><td style="padding:28px 40px 20px;border-bottom:1px solid #E2E8F0;"><table width="100%"><tr>',
      '<td><span style="display:inline-block;width:34px;height:34px;background:#0077B6;border-radius:8px;text-align:center;line-height:34px;font-weight:800;color:#fff;font-size:14px;">e</span></td>',
      '<td style="padding-left:12px;font-size:18px;font-weight:800;color:#0F172A;letter-spacing:-0.3px;">eLab <span style="color:#0077B6;">Complete</span></td>',
      '</tr></table></td></tr>',

      // Body
      '<tr><td style="padding:28px 40px 32px;">',
      '<p style="margin:0 0 18px;font-size:15px;color:#475569;">Dear <strong style="color:#0F172A;">' + esc(fullName) + '</strong>,</p>',
      '<div style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#334155;">' + bodyHtml + '</div>',
      '<p style="margin:0 0 4px;font-size:13px;color:#94A3B8;">If you have any questions, reply to this email or message us on WhatsApp at <strong style="color:#475569;">+1 (929) 419-2327</strong>.</p>',
      '</td></tr>',

      // Footer
      '<tr><td style="padding:20px 40px;border-top:1px solid #E2E8F0;text-align:center;">',
      '<p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">eLab Solutions International — Guaranteed Nursing Placement</p>',
      '<p style="margin:0;font-size:11px;color:#CBD5E1;"><a href="https://www.elabsolution.org" style="color:#CBD5E1;">www.elabsolution.org</a></p>',
      '</td></tr></table></td></tr></table></body></html>',
    ].join("\n");

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

    await transport.sendMail({
      from: '"eLab Solutions" <' + smtpUser + '>',
      to: existing.email,
      subject: trimmedSubject,
      text: candidatePlain,
      html: candidateHtml,
    });

    transport.close();

    // ── Log the send (after the email goes out, so we never log a failed send) ──
    const { error: logErr } = await sb
      .from("elab_complete_messages")
      .insert({
        consultation_id,
        sent_to: existing.email,
        subject: trimmedSubject,
        body: trimmedBody,
        template_key: template_key || "custom",
        sent_by: user.id,
      });

    if (logErr) {
      // Email already sent; surface a soft warning but don't fail the request.
      console.error("Log insert error:", logErr);
      return json({ ok: true, sent_to: existing.email, log_warning: logErr.message });
    }

    return json({ ok: true, sent_to: existing.email });

  } catch (err) {
    console.error("send-consultation-message error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});

function esc(str: string): string {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
