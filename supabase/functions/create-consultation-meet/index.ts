import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  create-consultation-meet — Called after a consultation booking form is submitted.
  1. Reads a Meet link from env (ELAB_CONSULTATION_MEET_LINK).
  2. Updates the elab_complete_consultations record with meet_link + status='confirmed'.
  3. Sends a confirmation email to the candidate via Gmail SMTP.
  4. Sends a notification email to Samuel (elabsolution9@gmail.com).
  5. Returns { meet_link }.

  Body: {
    consultation_id: string (uuid),
    full_name: string,
    email: string,
    consultation_date: string,
    consultation_time: string,
    preferred_destination: string
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
    const {
      consultation_id,
      full_name,
      email,
      consultation_date,
      consultation_time,
      preferred_destination,
    } = await req.json();

    if (!consultation_id) return json({ error: "consultation_id is required" }, 400);
    if (!email) return json({ error: "email is required" }, 400);
    if (!full_name) return json({ error: "full_name is required" }, 400);

    // ── Meet link ──
    const meet_link =
      Deno.env.get("ELAB_CONSULTATION_MEET_LINK") ||
      "https://meet.google.com/elab-consultation";

    // ── Supabase client ──
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Update the consultation record ──
    const { error: updateError } = await sb
      .from("elab_complete_consultations")
      .update({ meet_link, status: "confirmed" })
      .eq("id", consultation_id);

    if (updateError) {
      console.error("DB update error:", updateError);
      return json({ error: "Failed to update consultation record" }, 500);
    }

    // ── Fetch phone for Samuel's notification ──
    const { data: consultationRow } = await sb
      .from("elab_complete_consultations")
      .select("phone")
      .eq("id", consultation_id)
      .single();

    const phone = consultationRow?.phone || "N/A";

    // ── Build candidate confirmation email ──
    const candidatePlain = [
      `Dear ${full_name},`,
      "",
      "Thank you for booking a consultation with eLab Solutions for the eLab Complete program.",
      "",
      `\uD83D\uDCC5 Date: ${consultation_date}`,
      `\uD83D\uDD50 Time: ${consultation_time}`,
      `\uD83D\uDCCD Destination: ${preferred_destination}`,
      `\uD83D\uDD17 Google Meet: ${meet_link}`,
      "",
      "During this call, we will:",
      "\u2022 Assess your eligibility for the program",
      "\u2022 Walk you through the complete process",
      "\u2022 Answer all your questions",
      "\u2022 Discuss pricing and enrollment",
      "",
      "Please join the Google Meet link at your scheduled time. If you need to reschedule, reply to this email or message us on WhatsApp at +1 (929) 419-2327.",
      "",
      "Best regards,",
      "eLab Solutions International",
      "www.elabsolution.org",
    ].join("\n");

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
      '<tr><td style="padding:24px 40px 0;"><span style="display:inline-block;padding:5px 14px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:1px;color:#2EC4B6;background:#2EC4B615;border:1px solid #2EC4B630;">CONSULTATION CONFIRMED</span></td></tr>',

      // Body
      '<tr><td style="padding:20px 40px 32px;">',
      '<p style="margin:0 0 20px;font-size:15px;color:#475569;">Dear <strong style="color:#0F172A;">' + esc(full_name) + '</strong>,</p>',
      '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">Thank you for booking a consultation with <strong style="color:#0F172A;">eLab Solutions</strong> for the <strong style="color:#0F172A;">eLab Complete</strong> program.</p>',

      // Details card
      '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:20px 24px;margin:20px 0;">',
      '<p style="margin:0 0 12px;font-size:14px;color:#475569;"><span style="font-size:16px;">&#128197;</span> <strong style="color:#0F172A;">Date:</strong> ' + esc(consultation_date) + '</p>',
      '<p style="margin:0 0 12px;font-size:14px;color:#475569;"><span style="font-size:16px;">&#128336;</span> <strong style="color:#0F172A;">Time:</strong> ' + esc(consultation_time) + '</p>',
      '<p style="margin:0 0 12px;font-size:14px;color:#475569;"><span style="font-size:16px;">&#128205;</span> <strong style="color:#0F172A;">Destination:</strong> ' + esc(preferred_destination) + '</p>',
      '<p style="margin:0;font-size:14px;color:#475569;"><span style="font-size:16px;">&#128279;</span> <strong style="color:#0F172A;">Google Meet:</strong> <a href="' + meet_link + '" style="color:#0077B6;">' + esc(meet_link) + '</a></p>',
      '</div>',

      // Join button
      '<div style="margin:24px 0;">',
      '<a href="' + meet_link + '" style="display:inline-block;padding:14px 36px;background:#0077B6;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">Join Google Meet</a>',
      '</div>',

      // What to expect
      '<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#0F172A;">During this call, we will:</p>',
      '<ul style="margin:0 0 20px;padding-left:20px;color:#475569;font-size:15px;line-height:1.8;">',
      '<li>Assess your eligibility for the program</li>',
      '<li>Walk you through the complete process</li>',
      '<li>Answer all your questions</li>',
      '<li>Discuss pricing and enrollment</li>',
      '</ul>',

      '<p style="margin:0;font-size:14px;color:#64748B;line-height:1.7;">Please join the Google Meet link at your scheduled time. If you need to reschedule, reply to this email or message us on WhatsApp at <strong>+1 (929) 419-2327</strong>.</p>',

      '</td></tr>',

      // Footer
      '<tr><td style="padding:20px 40px;border-top:1px solid #E2E8F0;text-align:center;">',
      '<p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">eLab Solutions International \u2014 Guaranteed Nursing Placement</p>',
      '<p style="margin:0;font-size:11px;color:#CBD5E1;"><a href="https://www.elabsolution.org" style="color:#CBD5E1;">www.elabsolution.org</a></p>',
      '</td></tr></table></td></tr></table></body></html>',
    ].join("\n");

    // ── Build Samuel notification email ──
    const adminPlain = [
      "New eLab Complete consultation booked:",
      "",
      `Name: ${full_name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      `Destination: ${preferred_destination}`,
      `Date: ${consultation_date}`,
      `Time: ${consultation_time}`,
      `Meet Link: ${meet_link}`,
    ].join("\n");

    // ── Gmail SMTP setup ──
    const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
    const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");
    if (!smtpPass) return json({ error: "SMTP credentials not configured" }, 500);

    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    // ── Send candidate confirmation ──
    await transport.sendMail({
      from: '"eLab Solutions" <' + smtpUser + '>',
      to: email,
      subject: `eLab Complete Consultation Confirmed \u2014 ${consultation_date} at ${consultation_time}`,
      text: candidatePlain,
      html: candidateHtml,
    });

    // ── Send admin notification ──
    await transport.sendMail({
      from: '"eLab Booking System" <' + smtpUser + '>',
      to: "elabsolution9@gmail.com",
      subject: `New eLab Complete Consultation: ${full_name} (${preferred_destination})`,
      text: adminPlain,
    });

    transport.close();

    return json({ meet_link });

  } catch (err) {
    console.error("create-consultation-meet error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
