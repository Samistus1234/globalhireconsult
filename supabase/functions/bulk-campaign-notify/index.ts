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
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { campaign_id, target, subject, message, test_email } = await req.json();
    if (!subject || !message) return json({ error: "subject and message are required" }, 400);

    // SMTP config (shared by the test-send short-circuit and the bulk path).
    const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
    const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");
    if (!smtpPass) return json({ error: "SMTP credentials not configured" }, 500);
    const from = `"GlobalHire@eLab" <${smtpUser}>`;

    // POOLED transport — keep ONE authenticated connection alive and reuse it for
    // every message. A non-pooled transport opens a fresh connection + login per
    // sendMail, which Gmail blocks after ~100 logins with
    // "454-4.7.0 Too many login attempts". Pooling = a handful of logins total.
    // rateLimit/maxConnections throttle the burst so we stay gentle on Gmail and
    // finish well within the function's wall-clock limit.
    const makeTransport = () => nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
      pool: true,
      maxConnections: 3,
      maxMessages: 500,
      rateDelta: 1000,
      rateLimit: 10, // ≤10 messages/sec across the pool
    });

    // Test-send short-circuit: send ONE email to a given address and return.
    // Lets us verify SMTP login + delivery without touching the applicant list.
    if (test_email) {
      const transport = makeTransport();
      try {
        await transport.verify();
        const msg = message.replace(/Dear Applicant/gi, "Dear Tester");
        await transport.sendMail({ from, to: test_email, subject, text: msg, html: buildEmailHtml("Tester", subject, msg) });
        transport.close();
        console.log(`bulk-campaign-notify TEST sent to ${test_email}`);
        return json({ success: true, sent: 1, failed: 0, total: 1, recipients: [{ name: "Test", email: test_email, status: "sent" }] });
      } catch (testErr) {
        transport.close();
        console.error("bulk-campaign-notify test send failed:", testErr);
        return json({ error: `Test send failed: ${(testErr as Error)?.message || testErr}` }, 502);
      }
    }

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
      // Get ONLY matched candidates for THIS specific campaign — no fallbacks
      const { data: matches } = await serviceClient
        .from("gh_campaign_matches")
        .select("applicant_id")
        .eq("campaign_id", campaign_id);

      if (matches && matches.length > 0) {
        const ids = matches.map((m: any) => m.applicant_id);
        const { data: matchedProfiles } = await serviceClient
          .from("gh_profiles")
          .select("id, full_name, specialty")
          .in("id", ids);
        profiles = matchedProfiles || [];
      }

      if (profiles.length === 0) {
        return json({ error: "No matched candidates found for this campaign. Run AI Matching first to find matching applicants." }, 400);
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

    const transport = makeTransport();

    // Fail fast with a clear message if the login itself is rejected, instead of
    // letting every single message fail one-by-one.
    try {
      await transport.verify();
    } catch (verifyErr) {
      transport.close();
      console.error("bulk-campaign-notify SMTP verify failed:", verifyErr);
      return json({ error: `SMTP login failed: ${(verifyErr as Error)?.message || verifyErr}` }, 502);
    }

    // Resolve all applicant emails in ONE paginated pass over auth.users,
    // instead of a per-recipient getUserById round-trip.
    const emailById = new Map<string, string>();
    for (let page = 1; page <= 50; page++) {
      const { data: listed, error: listErr } = await serviceClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (listErr) { console.error("listUsers error:", listErr); break; }
      const users = listed?.users ?? [];
      for (const u of users) { if (u.email) emailById.set(u.id, u.email); }
      if (users.length < 1000) break;
    }

    // Fire all sends through the pool concurrently; the pool caps real concurrency
    // (maxConnections) and throughput (rateLimit). Order is preserved by index.
    const settled = await Promise.allSettled(profiles.map(async (p) => {
      const name = p.full_name || "Healthcare Professional";
      const email = emailById.get(p.id);
      if (!email) {
        return { name, email: "no email found", status: "failed" as const };
      }
      const personalizedMessage = message.replace(/Dear Applicant/gi, `Dear ${name}`);
      const htmlBody = buildEmailHtml(name, subject, personalizedMessage);
      await transport.sendMail({
        from,
        to: email,
        subject,
        text: personalizedMessage,
        html: htmlBody,
      });
      return { name, email, status: "sent" as const };
    }));

    transport.close();

    const recipients = settled.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      const p = profiles[i];
      console.error(`Failed to send to ${p.id}:`, r.reason?.message || r.reason);
      return { name: p.full_name || "Unknown", email: "error", status: "failed" as const };
    });

    const sentCount = recipients.filter((r) => r.status === "sent").length;
    const failCount = recipients.length - sentCount;
    console.log(`bulk-campaign-notify DONE — sent=${sentCount} failed=${failCount} total=${profiles.length}`);

    return json({ success: true, sent: sentCount, failed: failCount, total: profiles.length, recipients });

  } catch (err) {
    console.error("bulk-campaign-notify error:", err);
    return json({ error: (err as Error)?.message || "Internal server error" }, 500);
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
