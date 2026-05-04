import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  reschedule-consultation — admin-only. Reschedules an eLab Complete
  consultation:
    1. Captures the previous consultation_date / consultation_time onto
       rescheduled_from_* audit columns.
    2. Writes the new date/time, sets status='rescheduled', stamps
       rescheduled_at / rescheduled_by, persists the optional note.
    3. Emails the candidate with the new schedule + note + Meet link.

  Body: {
    consultation_id: string (uuid),
    new_date: string ('YYYY-MM-DD'),
    new_time: string ('HH:MM'),
    note?: string
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
    const { consultation_id, new_date, new_time, note } = await req.json();

    if (!consultation_id) return json({ error: "consultation_id is required" }, 400);
    if (!new_date) return json({ error: "new_date is required" }, 400);
    if (!new_time) return json({ error: "new_time is required" }, 400);

    // ── Load existing row so we can capture previous date/time ──
    const { data: existing, error: loadErr } = await sb
      .from("elab_complete_consultations")
      .select("id, full_name, email, consultation_date, consultation_time, preferred_destination, meet_link")
      .eq("id", consultation_id)
      .single();

    if (loadErr || !existing) {
      console.error("Load error:", loadErr);
      return json({ error: "Consultation not found" }, 404);
    }

    if (!existing.email) {
      return json({ error: "Consultation has no email on file" }, 400);
    }

    // ── Update with audit trail ──
    const { error: updateErr } = await sb
      .from("elab_complete_consultations")
      .update({
        consultation_date: new_date,
        consultation_time: new_time,
        status: "rescheduled",
        rescheduled_from_date: existing.consultation_date,
        rescheduled_from_time: existing.consultation_time,
        rescheduled_at: new Date().toISOString(),
        rescheduled_by: user.id,
        reschedule_note: note || null,
      })
      .eq("id", consultation_id);

    if (updateErr) {
      console.error("Update error:", updateErr);
      return json({ error: "Failed to update consultation: " + updateErr.message }, 500);
    }

    // ── Email candidate ──
    const meet_link =
      existing.meet_link ||
      Deno.env.get("ELAB_CONSULTATION_MEET_LINK") ||
      "https://meet.google.com/elab-consultation";

    const fullName = existing.full_name || "there";
    const destination = existing.preferred_destination || "";
    const previousDate = existing.consultation_date || "";
    const previousTime = existing.consultation_time || "";

    const candidatePlain = [
      `Dear ${fullName},`,
      "",
      "Your eLab Complete consultation has been rescheduled.",
      "",
      `📅 New Date: ${new_date}`,
      `🕐 New Time: ${new_time}`,
      destination ? `📍 Destination: ${destination}` : "",
      `🔗 Google Meet: ${meet_link}`,
      "",
      previousDate || previousTime
        ? `(Previously: ${previousDate || ""}${previousTime ? " at " + previousTime : ""})`
        : "",
      "",
      note ? `Note from our team: ${note}` : "",
      note ? "" : "",
      "Please join the Google Meet link at the new scheduled time. If the new slot does not work, reply to this email or message us on WhatsApp at +1 (929) 419-2327.",
      "",
      "Best regards,",
      "eLab Solutions International",
      "www.elabsolution.org",
    ].filter(Boolean).join("\n");

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

      // Badge
      '<tr><td style="padding:24px 40px 0;"><span style="display:inline-block;padding:5px 14px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:1px;color:#D4A84B;background:#D4A84B15;border:1px solid #D4A84B30;">CONSULTATION RESCHEDULED</span></td></tr>',

      // Body
      '<tr><td style="padding:20px 40px 32px;">',
      '<p style="margin:0 0 20px;font-size:15px;color:#475569;">Dear <strong style="color:#0F172A;">' + esc(fullName) + '</strong>,</p>',
      '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">Your <strong style="color:#0F172A;">eLab Complete</strong> consultation has been moved to a new time. Details below.</p>',

      // New schedule card
      '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:20px 24px;margin:20px 0;">',
      '<p style="margin:0 0 12px;font-size:14px;color:#475569;"><span style="font-size:16px;">&#128197;</span> <strong style="color:#0F172A;">New Date:</strong> ' + esc(new_date) + '</p>',
      '<p style="margin:0 0 12px;font-size:14px;color:#475569;"><span style="font-size:16px;">&#128336;</span> <strong style="color:#0F172A;">New Time:</strong> ' + esc(new_time) + '</p>',
      destination
        ? '<p style="margin:0 0 12px;font-size:14px;color:#475569;"><span style="font-size:16px;">&#128205;</span> <strong style="color:#0F172A;">Destination:</strong> ' + esc(destination) + '</p>'
        : '',
      '<p style="margin:0;font-size:14px;color:#475569;"><span style="font-size:16px;">&#128279;</span> <strong style="color:#0F172A;">Google Meet:</strong> <a href="' + meet_link + '" style="color:#0077B6;">' + esc(meet_link) + '</a></p>',
      '</div>',

      // Previous schedule (small print)
      (previousDate || previousTime)
        ? '<p style="margin:0 0 16px;font-size:13px;color:#94A3B8;">Previously scheduled for ' + esc(previousDate || '') + (previousTime ? ' at ' + esc(previousTime) : '') + '.</p>'
        : '',

      // Optional admin note
      note
        ? '<div style="background:#FFF8E6;border-left:3px solid #D4A84B;padding:14px 18px;margin:0 0 20px;border-radius:6px;"><p style="margin:0;font-size:14px;color:#5A4500;line-height:1.6;"><strong>Note from our team:</strong> ' + esc(note) + '</p></div>'
        : '',

      // Join button
      '<div style="margin:24px 0;">',
      '<a href="' + meet_link + '" style="display:inline-block;padding:14px 36px;background:#0077B6;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">Join Google Meet</a>',
      '</div>',

      '<p style="margin:0;font-size:14px;color:#64748B;line-height:1.7;">Please join the Google Meet link at the new scheduled time. If the new slot does not work, reply to this email or message us on WhatsApp at <strong>+1 (929) 419-2327</strong>.</p>',

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
      subject: `eLab Complete Consultation Rescheduled — ${new_date} at ${new_time}`,
      text: candidatePlain,
      html: candidateHtml,
    });

    transport.close();

    return json({ ok: true, sent_to: existing.email });

  } catch (err) {
    console.error("reschedule-consultation error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});

function esc(str: string): string {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
