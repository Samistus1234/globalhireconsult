import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Check caller is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await serviceClient
      .from("gh_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get campaign details
    const { data: campaign, error: campError } = await serviceClient
      .from("gh_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campError || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get pending matches
    const { data: matches, error: matchError } = await serviceClient
      .from("gh_campaign_matches")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("email_status", "pending");

    if (matchError || !matches || matches.length === 0) {
      return new Response(
        JSON.stringify({ error: "No pending matches to contact" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update campaign status to sending
    await serviceClient
      .from("gh_campaigns")
      .update({ status: "sending" })
      .eq("id", campaign_id);

    // Log sending start
    await serviceClient.from("gh_campaign_activity_log").insert({
      campaign_id,
      event_type: "emails_sending",
      event_data: { total: matches.length },
      actor_id: user.id,
    });

    // SMTP config from secrets
    const smtpUser = Deno.env.get("SMTP_USER") || "support@elabsolution.org";
    const smtpPass = Deno.env.get("SMTP_PASS");

    if (!smtpPass) {
      return new Response(
        JSON.stringify({ error: "SMTP credentials not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Base URL for response links
    const baseUrl = Deno.env.get("SITE_URL") || "https://globalhire.elabsolution.org";

    let sentCount = 0;
    let failCount = 0;

    // Connect SMTP
    const client = new SmtpClient();
    await client.connectTLS({
      hostname: "smtp.gmail.com",
      port: 465,
      username: smtpUser,
      password: smtpPass,
    });

    for (const match of matches) {
      try {
        // Mark as sending
        await serviceClient
          .from("gh_campaign_matches")
          .update({ email_status: "sending" })
          .eq("id", match.id);

        // Get applicant email from auth.users via service role
        const { data: authUser } = await serviceClient.auth.admin.getUserById(
          match.applicant_id
        );

        if (!authUser?.user?.email) {
          await serviceClient
            .from("gh_campaign_matches")
            .update({ email_status: "failed", email_error: "No email found" })
            .eq("id", match.id);
          failCount++;
          continue;
        }

        const applicantEmail = authUser.user.email;
        const applicantName = match.full_name || "Healthcare Professional";
        const responseUrl = `${baseUrl}/opportunity.html?token=${match.response_token}`;

        // Build HTML email
        const htmlBody = buildEmailHtml({
          applicantName,
          campaignTitle: campaign.title,
          employer: campaign.employer_name || "Confidential Employer",
          destination: campaign.destination_country,
          salary: campaign.salary_display || "Competitive",
          visa: campaign.visa_sponsored,
          positions: campaign.positions,
          matchScore: match.match_score,
          description: campaign.description || "",
          responseUrl,
        });

        // Send email
        await client.send({
          from: `GlobalHire@eLab <${smtpUser}>`,
          to: applicantEmail,
          subject: `New Opportunity: ${campaign.title} — ${campaign.destination_country}`,
          content: `You have been matched with a new opportunity: ${campaign.title}. Visit ${responseUrl} to respond.`,
          html: htmlBody,
        });

        // Mark as sent
        await serviceClient
          .from("gh_campaign_matches")
          .update({ email_status: "sent", email_sent_at: new Date().toISOString() })
          .eq("id", match.id);

        sentCount++;
      } catch (emailErr) {
        await serviceClient
          .from("gh_campaign_matches")
          .update({ email_status: "failed", email_error: String(emailErr) })
          .eq("id", match.id);
        failCount++;
      }
    }

    await client.close();

    // Update campaign counters and status
    await serviceClient
      .from("gh_campaigns")
      .update({
        contacted_count: sentCount,
        status: "active",
      })
      .eq("id", campaign_id);

    // Log completion
    await serviceClient.from("gh_campaign_activity_log").insert({
      campaign_id,
      event_type: "emails_sent",
      event_data: { sent: sentCount, failed: failCount },
      actor_id: user.id,
    });

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, failed: failCount }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

interface EmailParams {
  applicantName: string;
  campaignTitle: string;
  employer: string;
  destination: string;
  salary: string;
  visa: boolean;
  positions: number;
  matchScore: number;
  description: string;
  responseUrl: string;
}

function buildEmailHtml(p: EmailParams): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0c10;font-family:'Segoe UI',Roboto,sans-serif;color:#e0e4ec;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0c10;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#12151c;border:1px solid #1e2230;border-radius:16px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="padding:32px 40px 24px;border-bottom:1px solid #1e2230;">
    <table width="100%"><tr>
      <td><span style="display:inline-block;width:34px;height:34px;background:linear-gradient(135deg,#00e89d,#7c5cff);border-radius:8px;text-align:center;line-height:34px;font-weight:800;color:#fff;font-size:14px;">G</span></td>
      <td style="padding-left:12px;font-size:18px;font-weight:800;letter-spacing:-0.3px;">Global<span style="color:#00e89d;">Hire</span></td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px 40px;">
    <p style="margin:0 0 8px;color:#8b91a8;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">New Opportunity Match</p>
    <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#e0e4ec;">${p.campaignTitle}</h1>

    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a0a6b8;">
      Hi ${p.applicantName},<br><br>
      Based on your profile, we've matched you with an exciting opportunity. Here are the details:
    </p>

    <!-- Details Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#181c26;border:1px solid #1e2230;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <table width="100%">
          <tr>
            <td style="padding:6px 0;color:#8b91a8;font-size:13px;width:120px;">Employer</td>
            <td style="padding:6px 0;color:#e0e4ec;font-size:14px;font-weight:600;">${p.employer}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#8b91a8;font-size:13px;">Destination</td>
            <td style="padding:6px 0;color:#e0e4ec;font-size:14px;font-weight:600;">${p.destination}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#8b91a8;font-size:13px;">Salary</td>
            <td style="padding:6px 0;color:#00e89d;font-size:14px;font-weight:700;">${p.salary}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#8b91a8;font-size:13px;">Positions</td>
            <td style="padding:6px 0;color:#e0e4ec;font-size:14px;font-weight:600;">${p.positions} available</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#8b91a8;font-size:13px;">Visa</td>
            <td style="padding:6px 0;color:#e0e4ec;font-size:14px;">${p.visa ? '<span style="color:#00e89d;font-weight:600;">Sponsored</span>' : 'Not included'}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#8b91a8;font-size:13px;">Match Score</td>
            <td style="padding:6px 0;color:#7c5cff;font-size:14px;font-weight:700;">${p.matchScore}%</td>
          </tr>
        </table>
      </td></tr>
    </table>

    ${p.description ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#a0a6b8;">${p.description}</p>` : ''}

    <!-- CTA -->
    <p style="margin:0 0 16px;font-size:15px;color:#a0a6b8;">Are you interested in this opportunity?</p>
    <a href="${p.responseUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#00c484,#00e89d);color:#080a0d;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:-0.2px;">View Details & Respond</a>

    <p style="margin:24px 0 0;font-size:12px;color:#5a5f73;">This link expires in 14 days. You can also respond from your <a href="${p.responseUrl.split('/opportunity')[0]}/portal.html" style="color:#00e89d;">applicant portal</a>.</p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 40px;border-top:1px solid #1e2230;text-align:center;">
    <p style="margin:0;font-size:11px;color:#5a5f73;">GlobalHire@eLab &mdash; International Healthcare Recruitment</p>
    <p style="margin:4px 0 0;font-size:11px;color:#5a5f73;">eLab Solutions International LLC</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
