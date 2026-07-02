import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  promote-recruiter-submission
  ─────────────────────────────
  Admin-only. Takes a recruiter-submitted candidate and promotes it into the
  main candidate pool:

    1. Creates a real auth.users account for the candidate (globalhire.profiles.id
       FKs to auth.users(id) — there is no such thing as a standalone/auth-less
       profile row, so this is the only schema-legal way to create one).
    2. Fills in the profiles row with the submission's data, role='applicant',
       source='recruiter:{recruiter_id}' so the candidate is tagged in the main
       candidates.html list.
    3. Copies each recruiter_submission_documents row into globalhire.documents
       under the new applicant's own storage folder (so the standard
       gh_applicants_read_own_files policy covers them if the candidate ever
       logs in themselves — recruiter-submitted docs live under
       recruiter-clients/{recruiter_id}/... which the applicant cannot read).
    4. Sets recruiter_submitted_candidates.promoted_profile_id.
    5. Best-effort welcome email with a "set your password" recovery link
       (same pattern as supabase/functions/welcome-applicant).

  Body: { submission_id: string }
  Requires: Authorization header for an admin session (checked against
  globalhire.profiles.role via the service-role client below).
*/

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Admin auth check ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Invalid session" }, 401);

    const { data: callerProfile } = await sb
      .schema("globalhire").from("profiles").select("role").eq("id", user.id).single();
    if (callerProfile?.role !== "admin") return json({ error: "Admin access required" }, 403);

    // ── Load submission ──
    const { submission_id } = await req.json();
    if (!submission_id) return json({ error: "submission_id is required" }, 400);

    const { data: submission, error: subErr } = await sb
      .schema("globalhire").from("recruiter_submitted_candidates")
      .select("*").eq("id", submission_id).single();
    if (subErr || !submission) return json({ error: "Submission not found" }, 404);

    if (submission.promoted_profile_id) {
      return json({ success: true, already_promoted: true, profile_id: submission.promoted_profile_id });
    }

    if (!submission.email) {
      return json({ error: "Submission has no email on file — add an email before promoting (a portal account requires one)." }, 400);
    }

    // ── Create the auth account (profiles.id FKs to auth.users(id), so this
    //    is required — a bare INSERT into profiles would violate the FK) ──
    const tempPassword = crypto.randomUUID() + "-Aa1!";
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: submission.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: submission.full_name, role: "applicant", source: "recruiter_promotion" },
    });

    if (createErr) {
      return json({ error: "Could not create candidate account: " + createErr.message }, 400);
    }

    const newProfileId = created.user.id;

    // Wait briefly for the gh_on_auth_user_created trigger to insert the bare
    // profiles row (same wait pattern used in recruiter-register).
    await new Promise((r) => setTimeout(r, 1200));

    const initials = String(submission.full_name || "")
      .trim().split(/\s+/).map((w: string) => w[0]).join("").toUpperCase().substring(0, 2) || "C";
    const colorIndex = Math.floor(Math.random() * 8);

    const profilePayload = {
      full_name: submission.full_name,
      phone: submission.phone || null,
      specialty: submission.specialty || null,
      years_of_experience: submission.experience_years ?? null,
      country_of_origin: submission.current_country || null,
      preferred_destinations: submission.target_countries || [],
      license_number: submission.license_number || null,
      role: "applicant",
      source: "recruiter:" + submission.recruiter_id,
      profile_completed: false,
      avatar_initials: initials,
      avatar_color_index: colorIndex,
    };

    const { data: updateData, error: profErr } = await sb
      .schema("globalhire").from("profiles").update(profilePayload).eq("id", newProfileId).select();

    if (profErr) {
      console.error("Profile update error:", profErr);
    } else if (!updateData || updateData.length === 0) {
      // Trigger hasn't fired yet — insert directly (same fallback as recruiter-register).
      const { error: insertErr } = await sb
        .schema("globalhire").from("profiles").insert({ id: newProfileId, ...profilePayload });
      if (insertErr) console.error("Profile insert fallback error:", insertErr);
    }

    // ── Copy documents into the new applicant's own storage folder ──
    const { data: subDocs } = await sb
      .schema("globalhire").from("recruiter_submission_documents")
      .select("*").eq("submission_id", submission_id);

    const docErrors: string[] = [];
    let docsCopied = 0;

    for (const d of (subDocs || [])) {
      const ext = (String(d.file_path).split(".").pop() || "pdf").toLowerCase();
      const newPath = newProfileId + "/" + d.doc_type + "-" + Date.now() + "-" +
        Math.random().toString(36).slice(2, 8) + "." + ext;

      const { error: copyErr } = await sb.storage.from("gh-applicant-documents").copy(d.file_path, newPath);
      if (copyErr) {
        docErrors.push(d.doc_type + ": " + copyErr.message);
        continue;
      }

      const { error: insErr } = await sb.schema("globalhire").from("documents").insert({
        applicant_id: newProfileId,
        doc_type: d.doc_type,
        file_name: d.file_name,
        file_path: newPath,
        file_size_bytes: d.file_size_bytes,
        mime_type: d.mime_type,
        status: "pending",
      });
      if (insErr) {
        docErrors.push(d.doc_type + " (row insert): " + insErr.message);
        continue;
      }
      docsCopied++;
    }

    // ── Mark the submission as promoted ──
    const { error: markErr } = await sb
      .schema("globalhire").from("recruiter_submitted_candidates")
      .update({ promoted_profile_id: newProfileId, updated_at: new Date().toISOString() })
      .eq("id", submission_id);
    if (markErr) console.error("Failed to set promoted_profile_id:", markErr);

    // ── Best-effort welcome email (recovery link — same pattern as
    //    welcome-applicant; never blocks the promotion on failure) ──
    let welcomeEmailSent = false;
    try {
      const portalOrigin = Deno.env.get("SITE_URL") || "https://globalhire.elabsolution.org";
      const { data: linkData } = await sb.auth.admin.generateLink({
        type: "recovery",
        email: submission.email,
        options: { redirectTo: portalOrigin + "/login.html" },
      });
      const resetLink = linkData?.properties?.action_link;

      const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
      const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");

      if (resetLink && smtpPass) {
        const transport = nodemailer.createTransport({
          host: "smtp.gmail.com", port: 465, secure: true,
          auth: { user: smtpUser, pass: smtpPass },
        });

        const safeName = esc(submission.full_name || "there");
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:Segoe UI,Roboto,Helvetica Neue,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:40px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
<tr><td style="padding:28px 40px 20px;border-bottom:1px solid #E2E8F0;">
  <table width="100%"><tr>
    <td><span style="display:inline-block;width:34px;height:34px;background:#0077B6;border-radius:8px;text-align:center;line-height:34px;font-weight:800;color:#fff;font-size:14px;">G</span></td>
    <td style="padding-left:12px;font-size:18px;font-weight:800;color:#0F172A;">Global<span style="color:#0077B6;">Hire</span></td>
  </tr></table>
</td></tr>
<tr><td style="padding:24px 40px 0;">
  <span style="display:inline-block;padding:5px 14px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:1px;color:#0077B6;background:rgba(0,119,182,0.08);border:1px solid rgba(0,119,182,0.2);">CANDIDATE PROFILE READY</span>
</td></tr>
<tr><td style="padding:20px 40px 32px;">
  <p style="margin:0 0 20px;font-size:15px;color:#475569;">Hi <strong style="color:#0F172A;">${safeName}</strong>,</p>
  <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">Your recruiter submitted your details to GlobalHire@eLab and our team has added you to our candidate pool. We've created a portal account for you to track your application and manage your documents directly.</p>
  <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">Click the button below to set your password and access your portal.</p>
  <a href="${resetLink}" style="display:inline-block;padding:14px 32px;background:#0077B6;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">Set Your Password & Access Portal</a>
  <p style="margin:24px 0 0;font-size:13px;color:#94A3B8;">This link expires in 24 hours. If it expires, use "Forgot Password" on the login page.</p>
  <p style="margin:8px 0 0;font-size:13px;color:#94A3B8;">Portal: <a href="${portalOrigin}/login.html" style="color:#0077B6;">${portalOrigin}/login.html</a></p>
</td></tr>
<tr><td style="padding:20px 40px;border-top:1px solid #E2E8F0;text-align:center;">
  <p style="margin:0;font-size:12px;color:#94A3B8;">GlobalHire@eLab — International Healthcare Recruitment</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

        await transport.sendMail({
          from: '"GlobalHire@eLab" <' + smtpUser + '>',
          to: submission.email,
          subject: "Welcome to GlobalHire — Set Your Password",
          text: `Hi ${submission.full_name || "there"},\n\nYour recruiter submitted your details to GlobalHire@eLab and we've added you to our candidate pool. Set your password to access your portal:\n${resetLink}\n\nThis link expires in 24 hours.\n\n— GlobalHire@eLab`,
          html,
        });
        transport.close();
        welcomeEmailSent = true;
      }
    } catch (mailErr) {
      console.warn("promote-recruiter-submission welcome email failed (non-fatal):", mailErr);
    }

    return json({
      success: true,
      profile_id: newProfileId,
      documents_copied: docsCopied,
      documents_total: (subDocs || []).length,
      document_errors: docErrors,
      welcome_email_sent: welcomeEmailSent,
    });

  } catch (err) {
    console.error("promote-recruiter-submission error:", err);
    return json({ error: (err as Error).message || "Internal server error" }, 500);
  }
});

function esc(str: string): string {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
