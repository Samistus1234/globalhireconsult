import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  manage-recruiter (admin-only except add_note which is recruiter too)
  actions:
  - approve        { recruiter_id }
  - assign         { recruiter_id, applicant_id }
  - unassign       { recruiter_id, applicant_id }
  - add_note       { applicant_id, note }  — recruiter or admin
  - list_recruiters {}
*/

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: callerProfile } = await sb
      .from("gh_profiles").select("role").eq("id", user.id).single();

    const isAdmin = callerProfile?.role === "admin";
    const isRecruiter = callerProfile?.role === "recruiter";

    const body = await req.json();
    const { action } = body;

    // add_note: recruiter or admin
    if (action === "add_note") {
      if (!isAdmin && !isRecruiter) return json({ error: "Access denied" }, 403);
      const { applicant_id, note } = body;
      if (!applicant_id || !note?.trim()) return json({ error: "applicant_id and note required" }, 400);
      const recruiterId = isRecruiter ? user.id : body.recruiter_id || user.id;
      const { error } = await sb.schema("globalhire").from("recruiter_notes").insert({
        recruiter_id: recruiterId,
        applicant_id,
        note: note.trim(),
      });
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // All other actions: admin only
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    if (action === "approve") {
      const { recruiter_id } = body;
      if (!recruiter_id) return json({ error: "recruiter_id required" }, 400);
      const { error } = await sb.schema("globalhire").from("profiles")
        .update({ recruiter_approved: true, role: "recruiter" })
        .eq("id", recruiter_id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    if (action === "assign") {
      const { recruiter_id, applicant_id } = body;
      if (!recruiter_id || !applicant_id) return json({ error: "recruiter_id and applicant_id required" }, 400);

      const { error } = await sb.schema("globalhire").from("recruiter_assignments").upsert({
        recruiter_id,
        applicant_id,
        assigned_by: user.id,
        assigned_at: new Date().toISOString(),
      });
      if (error) return json({ error: error.message }, 500);

      // Send assignment notification email
      try {
        const { data: { user: recruiterUser } } = await sb.auth.admin.getUserById(recruiter_id);
        const recruiterEmail = recruiterUser?.email;

        const [{ data: rp }, { data: cp }] = await Promise.all([
          sb.schema("globalhire").from("profiles").select("full_name").eq("id", recruiter_id).single(),
          sb.schema("globalhire").from("profiles").select("full_name, specialty, country_of_origin").eq("id", applicant_id).single(),
        ]);

        const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
        const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");

        if (recruiterEmail && smtpPass) {
          const recruiterName = rp?.full_name || "Recruiter";
          const candidateName = cp?.full_name || "a new candidate";
          const specialty = cp?.specialty || "";
          const country = cp?.country_of_origin || "";
          const subLine = specialty ? specialty + (country ? " - " + country : "") : "";
          const subHtml = subLine ? "<div style=\"font-size:13px;color:#6B7280;margin-top:2px;\">" + subLine + "</div>" : "";

          const emailHtml = "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:32px 24px;border-radius:12px;\">"
            + "<div style=\"text-align:center;margin-bottom:28px;\"><span style=\"font-size:22px;font-weight:800;color:#0077B6;\">GlobalHire@eLab</span></div>"
            + "<div style=\"background:#fff;border-radius:10px;padding:28px 24px;border:1px solid #e5e7eb;\">"
            + "<p style=\"margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;\">Hello " + recruiterName + ",</p>"
            + "<p style=\"margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;\">A new candidate has been assigned to you on the GlobalHire@eLab recruiter portal. Please log in to review their profile and documents.</p>"
            + "<div style=\"background:#F0F9FF;border-left:4px solid #0077B6;border-radius:6px;padding:16px 18px;margin-bottom:24px;\">"
            + "<div style=\"font-size:13px;font-weight:700;color:#0077B6;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;\">Assigned Candidate</div>"
            + "<div style=\"font-size:16px;font-weight:700;color:#111827;\">" + candidateName + "</div>"
            + subHtml
            + "</div>"
            + "<a href=\"https://globalhireconsult.com/recruiter.html\" style=\"display:inline-block;background:#0077B6;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;\">Open Recruiter Portal</a>"
            + "</div>"
            + "<p style=\"text-align:center;font-size:11px;color:#9CA3AF;margin-top:20px;\">GlobalHire@eLab</p>"
            + "</div>";

          const smtp = new SMTPClient({
            connection: {
              hostname: "smtp.gmail.com",
              port: 465,
              tls: true,
              auth: { username: smtpUser, password: smtpPass },
            },
          });
          await smtp.send({
            from: smtpUser,
            to: recruiterEmail,
            subject: "New Candidate Assigned - " + candidateName,
            html: emailHtml,
          });
          await smtp.close();
        }
      } catch (emailErr) {
        console.error("Assignment notification email failed:", emailErr);
      }

      return json({ success: true });
    }

    if (action === "resend_welcome") {
      const { recruiter_id } = body;
      if (!recruiter_id) return json({ error: "recruiter_id required" }, 400);

      const { data: { user: recruiterUser } } = await sb.auth.admin.getUserById(recruiter_id);
      const recruiterEmail = recruiterUser?.email;
      if (!recruiterEmail) return json({ error: "Recruiter email not found" }, 404);

      const { data: rp } = await sb.schema("globalhire").from("profiles")
        .select("full_name").eq("id", recruiter_id).single();

      const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
      const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");
      if (!smtpPass) return json({ error: "SMTP not configured" }, 500);

      const recruiterName = rp?.full_name || "Recruiter";
      const emailHtml = "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:32px 24px;border-radius:12px;\">"
        + "<div style=\"text-align:center;margin-bottom:28px;\"><span style=\"font-size:22px;font-weight:800;color:#0077B6;\">GlobalHire@eLab</span></div>"
        + "<div style=\"background:#fff;border-radius:10px;padding:28px 24px;border:1px solid #e5e7eb;\">"
        + "<p style=\"margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;\">Hello " + recruiterName + ",</p>"
        + "<p style=\"margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;\">Welcome to <strong>GlobalHire@eLab</strong>! Your recruiter account has been set up. Use your email address (" + recruiterEmail + ") to log in to the recruiter portal.</p>"
        + "<a href=\"https://globalhireconsult.com/recruiter.html\" style=\"display:inline-block;background:#0077B6;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;\">Access Recruiter Portal</a>"
        + "<p style=\"margin:24px 0 0;font-size:13px;color:#6B7280;\">If you need your password reset, use the Forgot Password option on the login page.</p>"
        + "</div>"
        + "<p style=\"text-align:center;font-size:11px;color:#9CA3AF;margin-top:20px;\">GlobalHire@eLab</p>"
        + "</div>";

      const smtp = new SMTPClient({
        connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: smtpUser, password: smtpPass } },
      });
      await smtp.send({
        from: smtpUser,
        to: recruiterEmail,
        subject: "Welcome to GlobalHire@eLab - Your Recruiter Account",
        html: emailHtml,
      });
      await smtp.close();
      return json({ success: true });
    }

    if (action === "unassign") {
      const { recruiter_id, applicant_id } = body;
      if (!recruiter_id || !applicant_id) return json({ error: "recruiter_id and applicant_id required" }, 400);
      const { error } = await sb.schema("globalhire").from("recruiter_assignments")
        .delete()
        .eq("recruiter_id", recruiter_id)
        .eq("applicant_id", applicant_id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    if (action === "list_recruiters") {
      const { data: usersPage, error: usersErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
      if (usersErr) return json({ error: usersErr.message }, 500);

      const recruiterIds = (usersPage.users || [])
        .filter((u) => u.user_metadata?.role === "recruiter")
        .map((u) => u.id);

      if (recruiterIds.length === 0) return json({ success: true, recruiters: [] });

      await sb.schema("globalhire").from("profiles")
        .update({ role: "recruiter" })
        .in("id", recruiterIds)
        .neq("role", "recruiter");

      const { data: recruiters } = await sb.schema("globalhire").from("profiles")
        .select("id, full_name, organization_name, country_of_origin, phone, recruiter_approved, created_at")
        .in("id", recruiterIds)
        .order("created_at", { ascending: false });

      return json({ success: true, recruiters: recruiters || [] });
    }

    return json({ error: "Unknown action" }, 400);

  } catch (err) {
    console.error("manage-recruiter error:", err);
    return json({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
