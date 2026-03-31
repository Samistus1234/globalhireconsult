import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const TYPE_LABELS: Record<string, string> = {
  license: "Professional License",
  degree: "Degree / Certificate",
  passport: "Passport",
  cv: "CV / Resume",
  passport_photo: "Passport Photo",
  police_report: "Police Character Report",
  travel_insurance: "Travel Insurance",
};

/*
  notify-applicant — Email notifications for applicants

  Types:
  - "review_started"    → First email: "We are now reviewing your documents"
  - "review_complete"   → Final email: Summary table of all document statuses
  - "custom"            → Admin sends a custom message
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
    const body = await req.json();
    const applicantId: string = body.applicant_id;
    const type: string = body.type;
    const customSubject: string | undefined = body.subject;
    const customMessage: string | undefined = body.message;

    if (!applicantId || !type) {
      return json({ error: "applicant_id and type are required" }, 400);
    }

    // ── Get applicant ──
    const { data: profile } = await sb
      .from("gh_profiles")
      .select("full_name, specialty")
      .eq("id", applicantId)
      .single();

    if (!profile) return json({ error: "Applicant not found" }, 404);

    const { data: authUser } = await sb.auth.admin.getUserById(applicantId);
    if (!authUser?.user?.email) {
      return json({ error: "Applicant has no email address" }, 400);
    }

    const applicantEmail = authUser.user.email;
    const applicantName = profile.full_name || "Applicant";
    const portalUrl = (Deno.env.get("SITE_URL") || "https://globalhire.elabsolution.org") + "/portal.html";

    // ── Build email ──
    let emailSubject = "";
    let statusLabel = "";
    let statusColor = "";
    let bodyHtml = "";
    let ctaText = "";

    if (type === "review_started") {
      // ── EMAIL 1: Review has begun ──
      emailSubject = "Your Documents Are Now Under Review";
      statusLabel = "IN REVIEW";
      statusColor = "#48CAE4";
      ctaText = "Track Your Application";

      bodyHtml = '<p style="margin:0 0 20px;font-size:15px;color:#475569;">Hi <strong style="color:#0F172A;">' + esc(applicantName) + '</strong>,</p>';
      bodyHtml += '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">';
      bodyHtml += 'Thank you for submitting your documents. Our recruitment team is now reviewing them carefully.';
      bodyHtml += '</p>';
      bodyHtml += '<p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#475569;">';
      bodyHtml += 'We will send you an update once all your documents have been assessed. This typically takes 24-48 hours.';
      bodyHtml += '</p>';

    } else if (type === "review_complete") {
      // ── EMAIL 2: All docs reviewed — summary table ──
      const { data: allDocs } = await sb
        .from("gh_documents")
        .select("doc_type, status, reviewer_notes")
        .eq("applicant_id", applicantId)
        .order("uploaded_at", { ascending: true });

      const docs = allDocs || [];
      const allGood = docs.every((d: any) => d.status === "verified");
      const hasIssues = docs.some((d: any) => d.status === "rejected");

      if (allGood) {
        emailSubject = "All Documents Approved — You Are Ready";
        statusLabel = "ALL VERIFIED";
        statusColor = "#2EC4B6";
        ctaText = "View Your Status";
      } else if (hasIssues) {
        emailSubject = "Document Review Complete — Action Required";
        statusLabel = "ACTION REQUIRED";
        statusColor = "#E63946";
        ctaText = "View Details and Re-upload";
      } else {
        emailSubject = "Document Review Update";
        statusLabel = "REVIEW COMPLETE";
        statusColor = "#0077B6";
        ctaText = "View Your Status";
      }

      bodyHtml = '<p style="margin:0 0 20px;font-size:15px;color:#475569;">Hi <strong style="color:#0F172A;">' + esc(applicantName) + '</strong>,</p>';

      if (allGood) {
        bodyHtml += '<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;">';
        bodyHtml += 'Great news! All your submitted documents have been assessed by our recruitment team and found to be in order. Your profile is now ready for the next stage.';
        bodyHtml += '</p>';
      } else if (hasIssues) {
        bodyHtml += '<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;">';
        bodyHtml += 'Our recruitment team has completed the review of your documents. Some items require your attention — please see the summary below and take the necessary action.';
        bodyHtml += '</p>';
      } else {
        bodyHtml += '<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;">';
        bodyHtml += 'Our recruitment team has reviewed your documents. Here is a summary of the current status:';
        bodyHtml += '</p>';
      }

      // Document summary table
      bodyHtml += '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin-bottom:24px;">';
      bodyHtml += '<tr style="background:#F8FAFC;"><td style="padding:10px 16px;font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Document</td><td style="padding:10px 16px;font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Status</td></tr>';

      for (const d of docs) {
        const label = TYPE_LABELS[(d as any).doc_type] || (d as any).doc_type || "Document";
        const st = (d as any).status;
        let stLabel = "Pending";
        let stColor = "#94A3B8";
        if (st === "verified") { stLabel = "Approved"; stColor = "#2EC4B6"; }
        else if (st === "rejected") { stLabel = "Needs Attention"; stColor = "#E63946"; }
        else if (st === "in_review") { stLabel = "In Review"; stColor = "#48CAE4"; }

        bodyHtml += '<tr style="border-top:1px solid #E2E8F0;">';
        bodyHtml += '<td style="padding:12px 16px;font-size:14px;color:#0F172A;">' + esc(label) + '</td>';
        bodyHtml += '<td style="padding:12px 16px;font-size:13px;font-weight:600;color:' + stColor + ';">' + stLabel + '</td>';
        bodyHtml += '</tr>';

        if (st === "rejected" && (d as any).reviewer_notes) {
          bodyHtml += '<tr><td colspan="2" style="padding:4px 16px 12px;font-size:13px;color:#E63946;font-style:italic;">Note: ' + esc((d as any).reviewer_notes) + '</td></tr>';
        }
      }
      bodyHtml += '</table>';

      if (hasIssues) {
        bodyHtml += '<p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#475569;">Please log in to your portal to view the details and upload corrected documents where needed.</p>';
      }

      if (customMessage) {
        bodyHtml += '<p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#475569;padding:12px 16px;background:#F8FAFC;border-left:3px solid #0077B6;border-radius:4px;">' + esc(customMessage) + '</p>';
      }

    } else if (type === "custom") {
      emailSubject = customSubject || "Update from GlobalHire";
      statusLabel = "UPDATE";
      statusColor = "#0077B6";
      ctaText = "View in Portal";

      bodyHtml = '<p style="margin:0 0 20px;font-size:15px;color:#475569;">Hi <strong style="color:#0F172A;">' + esc(applicantName) + '</strong>,</p>';
      bodyHtml += '<p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#475569;">' + esc(customMessage || "You have a new update. Please log in to your portal for details.") + '</p>';

    } else {
      return json({ error: "Invalid type. Use: review_started, review_complete, or custom" }, 400);
    }

    // ── SMTP ──
    const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
    const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");
    if (!smtpPass) return json({ error: "SMTP credentials not configured" }, 500);

    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const badgeBg = statusColor + "15";
    const badgeBorder = statusColor + "30";

    const fullHtml = [
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
      '<body style="margin:0;padding:0;background:#F0F4F8;font-family:Segoe UI,Roboto,Helvetica Neue,sans-serif;color:#0F172A;">',
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:40px 20px;"><tr><td align="center">',
      '<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">',
      '<tr><td style="padding:28px 40px 20px;border-bottom:1px solid #E2E8F0;"><table width="100%"><tr>',
      '<td><span style="display:inline-block;width:34px;height:34px;background:#0077B6;border-radius:8px;text-align:center;line-height:34px;font-weight:800;color:#fff;font-size:14px;">G</span></td>',
      '<td style="padding-left:12px;font-size:18px;font-weight:800;color:#0F172A;letter-spacing:-0.3px;">Global<span style="color:#0077B6;">Hire</span></td>',
      '</tr></table></td></tr>',
      '<tr><td style="padding:24px 40px 0;"><span style="display:inline-block;padding:5px 14px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:1px;color:' + statusColor + ';background:' + badgeBg + ';border:1px solid ' + badgeBorder + ';">' + statusLabel + '</span></td></tr>',
      '<tr><td style="padding:20px 40px 32px;">',
      bodyHtml,
      '<a href="' + portalUrl + '" style="display:inline-block;padding:14px 32px;background:#0077B6;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">' + ctaText + '</a>',
      '<p style="margin:24px 0 0;font-size:13px;color:#94A3B8;">Access your portal: <a href="' + portalUrl + '" style="color:#0077B6;">' + portalUrl + '</a></p>',
      '</td></tr>',
      '<tr><td style="padding:20px 40px;border-top:1px solid #E2E8F0;text-align:center;">',
      '<p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">GlobalHire@eLab — International Healthcare Recruitment</p>',
      '<p style="margin:0;font-size:11px;color:#CBD5E1;">eLab Solutions International LLC</p>',
      '</td></tr></table></td></tr></table></body></html>',
    ].join("\n");

    const plainText = "Hi " + applicantName + ",\n\nYou have an update from GlobalHire. Visit your portal: " + portalUrl + "\n\n— GlobalHire@eLab";

    await transport.sendMail({
      from: '"GlobalHire@eLab" <' + smtpUser + '>',
      to: applicantEmail,
      subject: emailSubject,
      text: plainText,
      html: fullHtml,
    });

    transport.close();
    return json({ success: true, sent_to: applicantEmail, type });

  } catch (err) {
    console.error("Notify error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
