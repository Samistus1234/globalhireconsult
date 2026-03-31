import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  manage-recruiter (admin-only except add_note which is recruiter too)
  ───────────────────────────────────────────────────────────────────
  actions:
  - approve        { recruiter_id }
  - assign         { recruiter_id, applicant_id }
  - unassign       { recruiter_id, applicant_id }
  - add_note       { applicant_id, note }  — recruiter or admin
  - list_recruiters {}  — returns all recruiters with their assignment counts
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

    // ── add_note: recruiter or admin ──
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

      // ── Send assignment notification email to the recruiter ──
      try {
        // Fetch recruiter email from auth
        const { data: { user: recruiterUser } } = await sb.auth.admin.getUserById(recruiter_id);
        const recruiterEmail = recruiterUser?.email;

        // Fetch recruiter name and candidate details
        const [{ data: recruiterProfile }, { data: candidateProfile }] = await Promise.all([
          sb.schema("globalhire").from("profiles").select("full_name").eq("id", recruiter_id).single(),
          sb.schema("globalhire").from("profiles").select("full_name, specialty, country_of_origin").eq("id", applicant_id).single(),
        ]);

        const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
        const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");

        if (recruiterEmail && smtpPass) {
          const transport = nodemailer.createTransport({
            host: "smtp.gmail.com", port: 465, secure: true,
            auth: { user: smtpUser, pass: smtpPass },
          });

          const recruiterName = recruiterProfile?.full_name || "Recruiter";
          const candidateName = candidateProfile?.full_name || "a new candidate";
          const candidateSpecialty = candidateProfile?.specialty || "";
          const candidateCountry = candidateProfile?.country_of_origin || "";
          const portalUrl = "https://globalhireconsult.com/recruiter.html";

          await transport.sendMail({
            from: '"GlobalHire@eLab" <' + smtpUser + '>',
            to: recruiterEmail,
            subject: "New Candidate Assigned — " + candidateName,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:32px 24px;border-radius:12px;">
                <div style="text-align:center;margin-bottom:28px;">
                  <span style="font-size:22px;font-weight:800;color:#0077B6;letter-spacing:-0.5px;">GlobalHire<span style="color:#F4A261;">@</span>eLab</span>
                </div>
                <div style="background:#fff;border-radius:10px;padding:28px 24px;border:1px solid #e5e7eb;">
                  <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">Hello ${recruiterName},</p>
                  <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
                    A new candidate has been assigned to you on the <strong>GlobalHire@eLab</strong> recruiter portal. Please log in to review their profile and documents.
                  </p>
                  <div style="background:#F0F9FF;border-left:4px solid #0077B6;border-radius:6px;padding:16px 18px;margin-bottom:24px;">
                    <div style="font-size:13px;font-weight:700;color:#0077B6;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Assigned Candidate</div>
                    <div style="font-size:16px;font-weight:700;color:#111827;">${candidateName}</div>
                    ${candidateSpecialty ? `<div style="font-size:13px;color:#6B7280;margin-top:2px;">${candidateSpecialty}${candidateCountry ? " &nbsp;·&nbsp; " + candidateCountry : ""}</div>` : ""}
                  </div>
                  <a href="${portalUrl}" style="display:inline-block;background:#0077B6;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;">
                    Open Recruiter Portal →
                  </a>
                </div>
                <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:20px;">GlobalHire@eLab · You are receiving this because you are a registered recruiter.</p>
              </div>
            `,
          });
        }
      } catch (emailErr) {
        // Don't fail the assignment if email fails — just log it
        console.error("Assignment notification email failed:", emailErr);
      }

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
      // Pull all users whose auth metadata marks them as recruiter, then fetch profiles
      const { data: usersPage, error: usersErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
      if (usersErr) return json({ error: usersErr.message }, 500);

      const recruiterIds = (usersPage.users || [])
        .filter((u) => u.user_metadata?.role === "recruiter")
        .map((u) => u.id);

      if (recruiterIds.length === 0) return json({ success: true, recruiters: [] });

      // Fix any mismatched roles in profiles while we're here
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
