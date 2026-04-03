import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  check-recruiter-inactivity

  Runs on a schedule (every 12 hours). Finds recruiter assignments where:
  - No action taken (last_action_at IS NULL) and assigned_at > 48 hours ago
  - OR last_action_at > 48 hours ago
  - AND no reminder sent in the last 48 hours (to avoid spamming)

  Sends a reminder email to the recruiter for each stale assignment.
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
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find stale assignments: no action in 48+ hours, no recent reminder
    const { data: staleAssignments, error: queryErr } = await sb.rpc("get_stale_recruiter_assignments" as any);

    if (queryErr) {
      console.error("Query error:", queryErr);
      // Fallback: direct query
      const { data: fallback, error: fbErr } = await sb
        .schema("globalhire")
        .from("recruiter_assignments")
        .select("recruiter_id, applicant_id, assigned_at, last_action_at, reminder_sent_at")
        .or("last_action_at.is.null,last_action_at.lt." + new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .or("reminder_sent_at.is.null,reminder_sent_at.lt." + new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .lt("assigned_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());

      if (fbErr) {
        console.error("Fallback query error:", fbErr);
        return json({ error: "Failed to query stale assignments" }, 500);
      }
      return await processReminders(sb, fallback || [], json);
    }

    return await processReminders(sb, staleAssignments || [], json);
  } catch (err) {
    console.error("check-recruiter-inactivity error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});

async function processReminders(
  sb: any,
  assignments: any[],
  json: (body: unknown, status?: number) => Response
) {
  if (!assignments.length) {
    return json({ success: true, reminders_sent: 0, message: "No stale assignments found" });
  }

  // Filter: only assignments where assigned_at > 48hrs AND (no action OR action > 48hrs) AND (no reminder OR reminder > 48hrs)
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const stale = assignments.filter((a: any) => {
    const assignedAt = new Date(a.assigned_at).getTime();
    if (assignedAt > cutoff) return false; // Less than 48hrs since assignment

    const lastAction = a.last_action_at ? new Date(a.last_action_at).getTime() : 0;
    if (lastAction > cutoff) return false; // Action taken in last 48hrs

    const lastReminder = a.reminder_sent_at ? new Date(a.reminder_sent_at).getTime() : 0;
    if (lastReminder > cutoff) return false; // Reminder already sent in last 48hrs

    return true;
  });

  if (!stale.length) {
    return json({ success: true, reminders_sent: 0, message: "No reminders needed" });
  }

  const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
  const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");
  if (!smtpPass) return json({ error: "SMTP credentials not configured" }, 500);

  const smtp = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: smtpUser, password: smtpPass },
    },
  });

  let sent = 0;

  for (const assignment of stale) {
    try {
      // Get recruiter and applicant info
      const { data: { user: recruiterUser } } = await sb.auth.admin.getUserById(assignment.recruiter_id);
      const recruiterEmail = recruiterUser?.email;
      if (!recruiterEmail) continue;

      const [{ data: rp }, { data: cp }] = await Promise.all([
        sb.schema("globalhire").from("profiles").select("full_name").eq("id", assignment.recruiter_id).single(),
        sb.schema("globalhire").from("profiles").select("full_name, specialty, country_of_origin").eq("id", assignment.applicant_id).single(),
      ]);

      const recruiterName = rp?.full_name || "Recruiter";
      const candidateName = cp?.full_name || "an assigned candidate";
      const specialty = cp?.specialty || "";
      const country = cp?.country_of_origin || "";
      const subLine = specialty ? specialty + (country ? " — " + country : "") : "";
      const subHtml = subLine ? "<div style=\"font-size:13px;color:#6B7280;margin-top:2px;\">" + subLine + "</div>" : "";

      // Calculate hours since assignment
      const hoursSince = Math.round((Date.now() - new Date(assignment.assigned_at).getTime()) / 3600000);
      const timeSince = hoursSince >= 48 ? Math.round(hoursSince / 24) + " days" : hoursSince + " hours";

      const emailHtml = "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:32px 24px;border-radius:12px;\">"
        + "<div style=\"text-align:center;margin-bottom:28px;\"><span style=\"font-size:22px;font-weight:800;color:#0077B6;\">GlobalHire@eLab</span></div>"
        + "<div style=\"background:#fff;border-radius:10px;padding:28px 24px;border:1px solid #e5e7eb;\">"
        + "<p style=\"margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;\">Hello " + esc(recruiterName) + ",</p>"
        + "<p style=\"margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;\">This is a reminder that a candidate was assigned to you <strong>" + timeSince + " ago</strong> and is still pending your review. Please log in to review their profile and documents at your earliest convenience.</p>"
        + "<div style=\"background:#FFF7ED;border-left:4px solid #F59E0B;border-radius:6px;padding:16px 18px;margin-bottom:24px;\">"
        + "<div style=\"font-size:13px;font-weight:700;color:#D97706;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;\">Pending Review</div>"
        + "<div style=\"font-size:16px;font-weight:700;color:#111827;\">" + esc(candidateName) + "</div>"
        + subHtml
        + "<div style=\"font-size:12px;color:#9CA3AF;margin-top:6px;\">Assigned " + timeSince + " ago</div>"
        + "</div>"
        + "<a href=\"https://globalhireconsult.com/recruiter.html\" style=\"display:inline-block;background:#0077B6;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;\">Review Candidate Now</a>"
        + "</div>"
        + "<p style=\"text-align:center;font-size:11px;color:#9CA3AF;margin-top:20px;\">GlobalHire@eLab — Automated Reminder</p>"
        + "</div>";

      await smtp.send({
        from: smtpUser,
        to: recruiterEmail,
        subject: "Reminder: " + candidateName + " is awaiting your review",
        html: emailHtml,
      });

      // Mark reminder as sent
      await sb.schema("globalhire").from("recruiter_assignments").update({
        reminder_sent_at: new Date().toISOString(),
      }).eq("recruiter_id", assignment.recruiter_id).eq("applicant_id", assignment.applicant_id);

      sent++;
    } catch (emailErr) {
      console.error("Reminder email failed for assignment:", assignment.recruiter_id, "->", assignment.applicant_id, emailErr);
    }
  }

  await smtp.close();

  return json({ success: true, reminders_sent: sent, total_stale: stale.length });
}

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
