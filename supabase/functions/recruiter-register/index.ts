import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  recruiter-register
  ─────────────────
  Two modes:
  1. Self-registration (no auth) — creates account, marks recruiter_approved = false
  2. Admin creation (admin JWT) — creates account, marks recruiter_approved = true immediately
*/

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const body = await req.json();
    const { full_name, email, password, organization_name, country, phone } = body;

    if (!full_name || !email || !password) {
      return json({ error: "full_name, email and password are required" }, 400);
    }

    // Check if caller is an admin (admin creation = auto-approved)
    let adminCreated = false;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: callerProfile } = await sb
          .from("gh_profiles").select("role").eq("id", user.id).single();
        if (callerProfile?.role === "admin") adminCreated = true;
      }
    }

    // Create auth user
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: adminCreated, // admin-created accounts skip email confirmation
      user_metadata: { full_name, role: "recruiter" },
    });

    if (createErr) return json({ error: createErr.message }, 400);

    const userId = created.user.id;

    // Wait briefly for DB trigger to create profile
    await new Promise((r) => setTimeout(r, 1200));

    const initials = full_name.trim().split(/\s+/).map((w: string) => w[0]).join("").toUpperCase().substring(0, 2);
    const colorIndex = Math.floor(Math.random() * 8);

    // Upsert profile with recruiter fields
    const { error: profileErr } = await sb.schema("globalhire").from("profiles").upsert({
      id: userId,
      full_name,
      phone: phone || null,
      country_of_origin: country || null,
      organization_name: organization_name || null,
      role: "recruiter",
      recruiter_approved: adminCreated,
      avatar_initials: initials,
      avatar_color_index: colorIndex,
      profile_completed: false,
    });

    if (profileErr) {
      console.error("Profile upsert error:", profileErr);
      // Non-fatal — user was created, profile can be fixed
    }

    // ── Send welcome email ──
    const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
    const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");
    const portalUrl = (Deno.env.get("SITE_URL") || "https://globalhire.elabsolution.org") + "/recruiter.html";
    const loginUrl = (Deno.env.get("SITE_URL") || "https://globalhire.elabsolution.org") + "/login.html";

    if (smtpPass) {
      try {
        const transport = nodemailer.createTransport({
          host: "smtp.gmail.com", port: 465, secure: true,
          auth: { user: smtpUser, pass: smtpPass },
        });

        const subject = adminCreated
          ? "Your GlobalHire Recruiter Account is Ready"
          : "GlobalHire Recruiter Registration Received";

        const statusSection = adminCreated
          ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">Your recruiter account has been created and is <strong style="color:#2EC4B6;">approved and active</strong>. You can log in immediately using the credentials below.</p>`
          : `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">Your registration has been received. Your account is <strong style="color:#F59E0B;">pending approval</strong> by our team. We will notify you once approved.</p>`;

        const credBox = `
<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
  <div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Your Login Details</div>
  <div style="margin-bottom:8px;"><span style="font-size:12px;color:#94A3B8;">Email:</span> <strong style="font-size:14px;color:#0F172A;">${email}</strong></div>
  <div><span style="font-size:12px;color:#94A3B8;">Password:</span> <strong style="font-size:14px;color:#0F172A;">${password}</strong></div>
</div>`;

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
  <span style="display:inline-block;padding:5px 14px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:1px;color:#0077B6;background:rgba(0,119,182,0.08);border:1px solid rgba(0,119,182,0.2);">RECRUITER ACCOUNT</span>
</td></tr>
<tr><td style="padding:20px 40px 32px;">
  <p style="margin:0 0 20px;font-size:15px;color:#475569;">Hi <strong style="color:#0F172A;">${full_name}</strong>,</p>
  ${statusSection}
  ${credBox}
  ${adminCreated ? `<p style="margin:0 0 24px;font-size:14px;color:#475569;">We recommend changing your password after your first login via Account Settings.</p>` : ""}
  <a href="${adminCreated ? portalUrl : loginUrl}" style="display:inline-block;padding:14px 32px;background:#0077B6;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">${adminCreated ? "Go to Recruiter Portal" : "Check Application Status"}</a>
  <p style="margin:24px 0 0;font-size:13px;color:#94A3B8;">Portal: <a href="${portalUrl}" style="color:#0077B6;">${portalUrl}</a></p>
</td></tr>
<tr><td style="padding:20px 40px;border-top:1px solid #E2E8F0;text-align:center;">
  <p style="margin:0;font-size:12px;color:#94A3B8;">GlobalHire@eLab — International Healthcare Recruitment</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

        await transport.sendMail({
          from: '"GlobalHire@eLab" <' + smtpUser + '>',
          to: email,
          subject,
          text: `Hi ${full_name},\n\nYour GlobalHire recruiter account has been ${adminCreated ? "created. Login: " + loginUrl + "\nEmail: " + email + "\nPassword: " + password : "received and is pending approval."}\n\n— GlobalHire@eLab`,
          html,
        });
        transport.close();
      } catch (mailErr) {
        console.warn("Welcome email failed (non-fatal):", mailErr);
      }
    }

    return json({
      success: true,
      admin_created: adminCreated,
      user_id: userId,
      message: adminCreated
        ? "Recruiter account created and approved. Welcome email sent."
        : "Registration submitted. An admin will review and approve your account.",
    });

  } catch (err) {
    console.error("recruiter-register error:", err);
    return json({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
