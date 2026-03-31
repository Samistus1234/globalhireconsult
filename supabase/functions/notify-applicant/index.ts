import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/*
  notify-applicant Edge Function

  Sends email notifications to applicants when their document status changes
  or when admin sends a custom update.

  POST body:
  {
    "applicant_id": "uuid",
    "type": "document_analyzed" | "document_verified" | "document_rejected" | "custom",
    "document_id": "uuid" (optional — for document-specific notifications),
    "subject": "string" (optional — for custom type),
    "message": "string" (optional — for custom type or additional notes)
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

    // Verify admin
    const { data: adminProfile } = await sb
      .from("gh_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!adminProfile || adminProfile.role !== "admin") {
      return json({ error: "Admin access required" }, 403);
    }

    // ── Parse request ──
    const { applicant_id, type, document_id, subject: customSubject, message: customMessage } = await req.json();

    if (!applicant_id || !type) {
      return json({ error: "applicant_id and type are required" }, 400);
    }

    // ── Get applicant info ──
    const { data: profile } = await sb
      .from("gh_profiles")
      .select("full_name, specialty, preferred_destinations")
      .eq("id", applicant_id)
      .single();

    if (!profile) return json({ error: "Applicant not found" }, 404);

    // Get email from auth
    const { data: authUser } = await sb.auth.admin.getUserById(applicant_id);
    if (!authUser?.user?.email) {
      return json({ error: "Applicant has no email address" }, 400);
    }

    const applicantEmail = authUser.user.email;
    const applicantName = profile.full_name || "Applicant";

    // ── Get document details if provided ──
    let docInfo = "";
    let docTypeLabel = "";
    if (document_id) {
      const { data: doc } = await sb
        .from("gh_documents")
        .select("doc_type, file_name, status, analysis_results, authenticity_score, reviewer_notes")
        .eq("id", document_id)
        .single();

      if (doc) {
        const typeLabels: Record<string, string> = {
          license: "Professional License",
          degree: "Degree / Certificate",
          passport: "Passport",
          cv: "CV / Resume",
          passport_photo: "Passport Photo",
          police_report: "Police Character Report",
          travel_insurance: "Travel Insurance",
        };
        docTypeLabel = typeLabels[doc.doc_type] || doc.doc_type || "Document";
        docInfo = docTypeLabel;

        if (doc.analysis_results?.summary) {
          docInfo += ` — ${doc.analysis_results.summary}`;
        }
        if (doc.reviewer_notes) {
          docInfo += `\n\nReviewer notes: ${doc.reviewer_notes}`;
        }
      }
    }

    // ── Build email content based on type ──
    let emailSubject = "";
    let statusLabel = "";
    let statusColor = "";
    let bodyText = "";
    let ctaText = "";
    let ctaUrl = Deno.env.get("SITE_URL") || "https://globalhire.elabsolution.org";
    ctaUrl += "/portal.html";

    switch (type) {
      case "document_analyzed":
        emailSubject = `Document Under Review — ${docTypeLabel || "Update"}`;
        statusLabel = "IN REVIEW";
        statusColor = "#48CAE4";
        bodyText = `Your ${docTypeLabel || "document"} has been received and is now being reviewed by our verification team. We'll notify you once the review is complete.`;
        ctaText = "Track Your Documents";
        break;

      case "document_verified":
        emailSubject = `Document Verified ✓ — ${docTypeLabel || "Update"}`;
        statusLabel = "VERIFIED";
        statusColor = "#2EC4B6";
        bodyText = `Great news! Your ${docTypeLabel || "document"} has been verified and approved. ${customMessage ? "\n\n" + customMessage : ""}`;
        ctaText = "View Your Status";
        break;

      case "document_rejected":
        emailSubject = `Action Required — ${docTypeLabel || "Document"} Needs Attention`;
        statusLabel = "ACTION REQUIRED";
        statusColor = "#E63946";
        bodyText = `Your ${docTypeLabel || "document"} requires attention. ${customMessage ? customMessage : "Please log in to your portal to see the details and upload a corrected version."}`;
        ctaText = "View Details & Re-upload";
        break;

      case "custom":
        emailSubject = customSubject || "Update from GlobalHire";
        statusLabel = "UPDATE";
        statusColor = "#0077B6";
        bodyText = customMessage || "You have a new update from GlobalHire. Please log in to your portal for details.";
        ctaText = "View in Portal";
        break;

      default:
        return json({ error: "Invalid notification type: " + type }, 400);
    }

    // ── SMTP ──
    const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
    const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");

    if (!smtpPass) {
      return json({ error: "SMTP credentials not configured" }, 500);
    }

    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const htmlBody = buildEmailHtml({
      applicantName,
      subject: emailSubject,
      statusLabel,
      statusColor,
      bodyText,
      ctaText,
      ctaUrl,
      portalUrl: ctaUrl,
    });

    await transport.sendMail({
      from: `"GlobalHire@eLab" <${smtpUser}>`,
      to: applicantEmail,
      subject: emailSubject,
      text: `Hi ${applicantName},\n\n${bodyText}\n\nView your portal: ${ctaUrl}\n\n— GlobalHire@eLab`,
      html: htmlBody,
    });

    transport.close();

    return json({ success: true, sent_to: applicantEmail, type });
  } catch (err) {
    console.error("Notify error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});

interface EmailParams {
  applicantName: string;
  subject: string;
  statusLabel: string;
  statusColor: string;
  bodyText: string;
  ctaText: string;
  ctaUrl: string;
  portalUrl: string;
}

function buildEmailHtml(p: EmailParams): string {
  // Escape HTML in body text and convert newlines to <br>
  const safeBody = p.bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:#0F172A;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="padding:28px 40px 20px;border-bottom:1px solid #E2E8F0;">
    <table width="100%"><tr>
      <td><span style="display:inline-block;width:34px;height:34px;background:#0077B6;border-radius:8px;text-align:center;line-height:34px;font-weight:800;color:#fff;font-size:14px;">G</span></td>
      <td style="padding-left:12px;font-size:18px;font-weight:800;color:#0F172A;letter-spacing:-0.3px;">Global<span style="color:#0077B6;">Hire</span></td>
    </tr></table>
  </td></tr>

  <!-- Status Badge -->
  <tr><td style="padding:24px 40px 0;">
    <span style="display:inline-block;padding:5px 14px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:1px;color:${p.statusColor};background:${p.statusColor}15;border:1px solid ${p.statusColor}30;">${p.statusLabel}</span>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:20px 40px 32px;">
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">Hi <strong style="color:#0F172A;">${p.applicantName}</strong>,</p>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#475569;">${safeBody}</p>

    <!-- CTA Button -->
    <a href="${p.ctaUrl}" style="display:inline-block;padding:14px 32px;background:#0077B6;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">${p.ctaText}</a>

    <p style="margin:24px 0 0;font-size:13px;color:#94A3B8;">You can also access your portal directly at <a href="${p.portalUrl}" style="color:#0077B6;">${p.portalUrl}</a></p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 40px;border-top:1px solid #E2E8F0;text-align:center;">
    <p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">GlobalHire@eLab — International Healthcare Recruitment</p>
    <p style="margin:0;font-size:11px;color:#CBD5E1;">eLab Solutions International LLC</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
