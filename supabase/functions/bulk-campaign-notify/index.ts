import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  bulk-campaign-notify — Send custom email to all applicants or specialty-filtered applicants.
  Called from the campaign admin "Notify Applicants" modal.

  Body: {
    campaign_id: string,
    target: "all" | "specialty",
    subject: string,
    message: string
  }

  Requires admin auth.
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
    // Verify authorization using the JWT from the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    // Extract the JWT token
    const token = authHeader.replace("Bearer ", "");

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the user from the JWT
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized: " + (authError?.message || "invalid token") }, 401);

    // Check admin role
    const { data: profile } = await serviceClient
      .from("gh_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return json({ error: "Admin access required. Your role: " + (profile?.role || "none") }, 403);
    }

    const { campaign_id, target, subject, message } = await req.json();
    if (!subject || !message) return json({ error: "subject and message are required" }, 400);

    // Get campaign info
    let specialty: string | null = null;
    if (campaign_id) {
      const { data: campaign } = await serviceClient
        .from("gh_campaigns")
        .select("specialty")
        .eq("id", campaign_id)
        .single();
      specialty = campaign?.specialty || null;
    }

    let profiles: { id: string; full_name: string; specialty: string }[] = [];

    if (target === "matched" && campaign_id) {
      // Get matched candidates for this campaign
      const { data: matches } = await serviceClient
        .from("gh_campaign_matches")
        .select("applicant_id");
      // If no matches view, try direct query
      if (matches && matches.length > 0) {
        const ids = matches.map((m: any) => m.applicant_id);
        const { data: matchedProfiles } = await serviceClient
          .from("gh_profiles")
          .select("id, full_name, specialty")
          .in("id", ids);
        profiles = matchedProfiles || [];
      }
      // If still no profiles, fall back to all applicants for this specialty
      if (profiles.length === 0 && specialty) {
        const { data: specProfiles } = await serviceClient
          .from("gh_profiles")
          .select("id, full_name, specialty")
          .eq("role", "applicant")
          .eq("specialty", specialty);
        profiles = specProfiles || [];
      }
      if (profiles.length === 0) {
        // Final fallback: all applicants
        const { data: allProfiles } = await serviceClient
          .from("gh_profiles")
          .select("id, full_name, specialty")
          .eq("role", "applicant");
        profiles = allProfiles || [];
      }
    } else {
      // "all" or "specialty" target
      let profileQuery = serviceClient
        .from("gh_profiles")
        .select("id, full_name, specialty")
        .eq("role", "applicant");

      if (target === "specialty" && specialty) {
        profileQuery = profileQuery.eq("specialty", specialty);
      }

      const { data: fetchedProfiles, error: profileError } = await profileQuery;
      profiles = fetchedProfiles || [];
    }

    if (profiles.length === 0) {
      return json({ error: "No applicants found for this target" }, 400);
    }

    // SMTP setup
    const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
    const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");
    if (!smtpPass) return json({ error: "SMTP credentials not configured" }, 500);

    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    let sentCount = 0;
    let failCount = 0;

    for (const p of profiles) {
      try {
        // Get email from auth.users
        const { data: authUser } = await serviceClient.auth.admin.getUserById(p.id);
        if (!authUser?.user?.email) {
          failCount++;
          continue;
        }

        const name = p.full_name || "Healthcare Professional";
        const email = authUser.user.email;

        // Build personalized message (replace {{name}} placeholder)
        const personalizedMessage = message.replace(/Dear Applicant/gi, `Dear ${name}`);

        const htmlBody = buildEmailHtml(name, subject, personalizedMessage);

        await transport.sendMail({
          from: `"GlobalHire@eLab" <${smtpUser}>`,
          to: email,
          subject: subject,
          text: personalizedMessage,
          html: htmlBody,
        });

        sentCount++;
      } catch (emailErr) {
        console.error(`Failed to send to ${p.id}:`, emailErr);
        failCount++;
      }
    }

    transport.close();

    return json({ success: true, sent: sentCount, failed: failCount, total: profiles.length });

  } catch (err) {
    console.error("bulk-campaign-notify error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildEmailHtml(name: string, subject: string, message: string): string {
  // Convert plain text message to HTML paragraphs
  const messageHtml = esc(message)
    .split("\n\n")
    .map(p => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#a0a6b8;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0c10;font-family:'Segoe UI',Roboto,sans-serif;color:#e0e4ec;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0c10;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#12151c;border:1px solid #1e2230;border-radius:16px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="padding:28px 40px 20px;border-bottom:1px solid #1e2230;">
    <table width="100%"><tr>
      <td><span style="display:inline-block;width:34px;height:34px;background:linear-gradient(135deg,#00e89d,#7c5cff);border-radius:8px;text-align:center;line-height:34px;font-weight:800;color:#fff;font-size:14px;">G</span></td>
      <td style="padding-left:12px;font-size:18px;font-weight:800;letter-spacing:-0.3px;">Global<span style="color:#00e89d;">Hire</span></td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px 40px;">
    <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#e0e4ec;">${esc(subject)}</h1>
    ${messageHtml}

    <div style="margin:32px 0 0;">
      <a href="https://globalhire.elabsolution.org/jobs.html" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#00c484,#00e89d);color:#080a0d;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;">Browse All Opportunities</a>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 40px;border-top:1px solid #1e2230;text-align:center;">
    <p style="margin:0 0 4px;font-size:11px;color:#5a5f73;">GlobalHire@eLab &mdash; International Healthcare Recruitment</p>
    <p style="margin:0;font-size:11px;color:#5a5f73;">eLab Solutions International LLC</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
