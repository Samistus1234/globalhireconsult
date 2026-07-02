import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

/*
  notify-recruiter-status — Task A7

  Called (non-blocking, fire-and-forget) from the admin "Recruiter Submissions"
  review panel (js/recruiter-submissions.js → updateSubmission()) right after an
  admin saves a new admin_status / admin_note on a
  globalhire.recruiter_submitted_candidates row. Emails the submitting recruiter
  so they don't have to keep polling the portal.

  Body: { submission_id, recruiter_id, recruiter_name?, candidate_name?, admin_status, admin_note? }
  - submission_id / recruiter_id / admin_status are required.
  - recruiter_name / candidate_name are client-supplied hints only (for a snappier
    email while the DB round-trip below is in flight); the function re-derives
    candidate_name and admin_note from the submission row and always re-derives
    the recruiter's name + email server-side. globalhire.profiles has no `email`
    column (see schema.sql) — the recruiter's email lives on auth.users, so it is
    resolved here via the service-role auth admin API, matching the pattern used
    by notify-applicant for applicant emails. This also means the recipient can
    never be client-controlled.

  Auth: same as notify-applicant — caller must be a logged-in admin
  (globalhire.profiles.role = 'admin'). A failed/slow send here must never break
  the admin's status save, so the caller invokes this with .catch() and ignores
  the result.

  Mailer: Gmail SMTP via nodemailer, same transport/env vars as notify-applicant /
  notify-interest / gh-send-outreach (GMAIL_USER/GMAIL_APP_PASSWORD, falling back
  to SMTP_USER/SMTP_PASS).
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  submitted:    { label: "Submitted",     color: "#94A3B8" },
  under_review: { label: "Under Review",  color: "#D4A84B" },
  shortlisted:  { label: "Shortlisted",   color: "#0096C7" },
  placed:       { label: "Placed",        color: "#16A34A" },
  rejected:     { label: "Rejected",      color: "#DC2626" },
};

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
    // ── Auth: logged-in admin only ──
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
      .schema("globalhire")
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!adminProfile || adminProfile.role !== "admin") {
      return json({ error: "Admin access required" }, 403);
    }

    // ── Parse ──
    const body = await req.json();
    const submissionId: string | undefined = body.submission_id;
    const recruiterId: string | undefined = body.recruiter_id;
    const adminStatus: string | undefined = body.admin_status;

    if (!submissionId || !recruiterId || !adminStatus) {
      return json({ error: "submission_id, recruiter_id and admin_status are required" }, 400);
    }

    // ── Re-derive candidate name + admin note from the submission itself
    //    (authoritative — never trust client-supplied copy for the email body) ──
    const { data: submission } = await sb
      .schema("globalhire")
      .from("recruiter_submitted_candidates")
      .select("full_name, admin_note, recruiter_id")
      .eq("id", submissionId)
      .single();

    if (!submission || submission.recruiter_id !== recruiterId) {
      return json({ error: "Submission not found for that recruiter" }, 404);
    }

    const candidateName = submission.full_name || body.candidate_name || "your candidate";
    const adminNote: string = submission.admin_note || body.admin_note || "";

    // ── Recruiter identity: name from globalhire.profiles, email from auth.users ──
    const { data: recruiterProfile } = await sb
      .schema("globalhire")
      .from("profiles")
      .select("full_name")
      .eq("id", recruiterId)
      .single();

    const { data: recruiterAuth } = await sb.auth.admin.getUserById(recruiterId);
    const recruiterEmail = recruiterAuth?.user?.email;
    if (!recruiterEmail) return json({ error: "Recruiter has no email address" }, 400);

    const recruiterName = recruiterProfile?.full_name || body.recruiter_name || "there";

    const statusInfo = STATUS_INFO[adminStatus] || { label: adminStatus, color: "#0077B6" };
    const portalUrl = (Deno.env.get("SITE_URL") || "https://globalhire.elabsolution.org") + "/recruiter.html";

    // ── SMTP (same Gmail transport used across GlobalHire notify functions) ──
    const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
    const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");
    if (!smtpPass) return json({ error: "SMTP credentials not configured" }, 500);

    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const emailSubject = `Update on your candidate ${candidateName}`;
    const badgeBg = statusInfo.color + "15";
    const badgeBorder = statusInfo.color + "30";

    const noteHtml = adminNote
      ? '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-left:3px solid #0077B6;border-radius:4px;margin:0 0 24px;"><tr><td style="padding:14px 18px;">' +
        '<div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Admin Note</div>' +
        '<div style="font-size:14px;line-height:1.6;color:#334155;white-space:pre-wrap;">' + esc(adminNote) + '</div>' +
        '</td></tr></table>'
      : "";

    const bodyHtml =
      '<p style="margin:0 0 20px;font-size:15px;color:#475569;">Hi <strong style="color:#0F172A;">' + esc(recruiterName) + '</strong>,</p>' +
      '<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;">' +
      'The status of your submitted candidate <strong style="color:#0F172A;">' + esc(candidateName) + '</strong> has been updated to:' +
      '</p>' +
      '<p style="margin:0 0 24px;"><span style="display:inline-block;padding:6px 16px;border-radius:50px;font-size:12px;font-weight:700;letter-spacing:0.5px;color:' + statusInfo.color + ';background:' + badgeBg + ';border:1px solid ' + badgeBorder + ';">' + esc(statusInfo.label.toUpperCase()) + '</span></p>' +
      noteHtml +
      '<p style="margin:0 0 28px;font-size:14px;line-height:1.7;color:#475569;">Log in to your recruiter portal to view the full submission and any next steps.</p>';

    const fullHtml = [
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
      '<body style="margin:0;padding:0;background:#F0F4F8;font-family:Segoe UI,Roboto,Helvetica Neue,sans-serif;color:#0F172A;">',
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:40px 20px;"><tr><td align="center">',
      '<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">',
      '<tr><td style="padding:28px 40px 20px;border-bottom:1px solid #E2E8F0;"><table width="100%"><tr>',
      '<td><span style="display:inline-block;width:34px;height:34px;background:#0077B6;border-radius:8px;text-align:center;line-height:34px;font-weight:800;color:#fff;font-size:14px;">G</span></td>',
      '<td style="padding-left:12px;font-size:18px;font-weight:800;color:#0F172A;letter-spacing:-0.3px;">Global<span style="color:#0077B6;">Hire</span></td>',
      '</tr></table></td></tr>',
      '<tr><td style="padding:24px 40px 0;"><span style="display:inline-block;padding:5px 14px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:1px;color:#0077B6;background:#0077B615;border:1px solid #0077B630;">CANDIDATE UPDATE</span></td></tr>',
      '<tr><td style="padding:20px 40px 32px;">',
      bodyHtml,
      '<a href="' + portalUrl + '" style="display:inline-block;padding:14px 32px;background:#0077B6;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">View in Recruiter Portal</a>',
      '<p style="margin:24px 0 0;font-size:13px;color:#94A3B8;">Access your portal: <a href="' + portalUrl + '" style="color:#0077B6;">' + portalUrl + '</a></p>',
      '</td></tr>',
      '<tr><td style="padding:20px 40px;border-top:1px solid #E2E8F0;text-align:center;">',
      '<p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">GlobalHire@eLab — International Healthcare Recruitment</p>',
      '<p style="margin:0;font-size:11px;color:#CBD5E1;">eLab Solutions International LLC</p>',
      '</td></tr></table></td></tr></table></body></html>',
    ].join("\n");

    const plainText =
      `Hi ${recruiterName},\n\n` +
      `The status of your submitted candidate ${candidateName} has been updated to: ${statusInfo.label}.\n\n` +
      (adminNote ? `Admin note: ${adminNote}\n\n` : "") +
      `View in your recruiter portal: ${portalUrl}\n\n— GlobalHire@eLab`;

    await transport.sendMail({
      from: `"GlobalHire@eLab" <${smtpUser}>`,
      to: recruiterEmail,
      subject: emailSubject,
      text: plainText,
      html: fullHtml,
    });

    transport.close();

    return json({ success: true, sent_to: recruiterEmail, status: adminStatus });
  } catch (err) {
    console.error("notify-recruiter-status error:", err);
    return json({ error: (err as Error)?.message || "Internal server error" }, 500);
  }
});

function esc(str: string): string {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
