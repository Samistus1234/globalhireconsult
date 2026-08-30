import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, x-internal-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  stage-change-notify — Branded email to a candidate whenever their pipeline
  stage changes (schema-v26-stage-emails.sql trigger → pg_net → this fn).

  Auth: x-internal-secret header must equal the INTERNAL_TRIGGER_SECRET
  function secret (the notify-interest pattern). Never callable with the anon
  key alone.

  Body: { applicant_id, old_stage, new_stage, triggered_by? }

  Stages not in STAGE_TEMPLATES are deliberately silent (lead/revenue stages,
  and exits don't change pipeline_stage so they never reach here). The map is
  the toggle: add a stage to email it, remove a stage to silence it.

  After sending, inserts an outbound row into globalhire.messages so the email
  also appears in the candidate's portal thread + notification bell.
*/

type Template = {
  subject: string;
  badge: string;
  color: string;
  cta: string;
  intro: string;
  bullets?: string[];
  closing?: string;
};

// ── The 10 stages that email. Absence = silent. ──
const STAGE_TEMPLATES: Record<string, Template> = {
  qualified: {
    subject: "You're Qualified — Here's What's Next",
    badge: "QUALIFIED",
    color: "#2EC4B6",
    cta: "View Your Progress",
    intro:
      "Great news — your application and documents have been assessed and you've passed our qualification stage. You're now formally Qualified in our pipeline.",
    bullets: [
      "Your profile is fully in order",
      "We'll now look for the right employer opportunities for you",
      "Keep your availability and contact details up to date in your portal",
    ],
    closing:
      "We'll be in touch as soon as we have a suitable employer to present your profile to. In the meantime, make sure your documents are complete and valid.",
  },

  shortlisted: {
    subject: "Congratulations — You've Been Shortlisted",
    badge: "SHORTLISTED",
    color: "#10B981",
    cta: "View Your Status",
    intro:
      "Great news! You've been shortlisted. Your profile stood out among the candidates we're working with, and we're moving you forward.",
    bullets: [
      "Your profile has been selected for employer consideration",
      "We'll present you to employers that match your specialty and preferences",
      "Please keep your availability up to date in your portal",
    ],
    closing:
      "The next step is presenting your profile to employers. Watch your inbox and portal for updates.",
  },

  presented_to_employer: {
    subject: "Your Profile Has Been Presented to an Employer",
    badge: "PRESENTED TO EMPLOYER",
    color: "#0077B6",
    cta: "Track Your Application",
    intro:
      "We have presented your profile to an employer that matches your specialty and career goals.",
    bullets: [
      "Your profile is now with the employer's recruitment team",
      "They may invite you to interview — keep an eye on your portal",
      "Make sure your contact details are current",
    ],
    closing:
      "There's no action needed from you right now. We'll update you as soon as the employer responds.",
  },

  interview_scheduled: {
    subject: "Interview Scheduled — Please Prepare",
    badge: "INTERVIEW SCHEDULED",
    color: "#0EA5E9",
    cta: "View Interview Details",
    intro:
      "You've been invited to an interview! Log in to your portal for the date, time and interview details.",
    bullets: [
      "Review the interview details in your portal",
      "Prepare your documents and practice your responses",
      "Let us know promptly if you need to reschedule",
    ],
    closing:
      "We're here to help you prepare. If you have questions about the interview, reply to this email or reach out to your recruiter.",
  },

  interview_completed: {
    subject: "Thanks for Interviewing — What's Next",
    badge: "INTERVIEW COMPLETED",
    color: "#0EA5E9",
    cta: "View Your Status",
    intro: "Thank you for completing your interview. We hope it went well!",
    bullets: [
      "The employer will now review your interview",
      "We'll update you as soon as we hear back",
      "Keep your portal open for the next update",
    ],
    closing:
      "Whatever the outcome, we'll guide you on the next best step for your career.",
  },

  offer_extended: {
    subject: "Offer Extended — Congratulations",
    badge: "OFFER EXTENDED",
    color: "#D4A84B",
    cta: "Review Your Offer",
    intro:
      "Congratulations! An employer has extended an offer to you. This is a big milestone.",
    bullets: [
      "Review the offer details in your portal",
      "Let us know if you accept, or if you have questions",
      "We'll guide you through the next steps once you respond",
    ],
    closing:
      "If you'd like any clarification on the offer, reply to this email or speak with your recruiter.",
  },

  offer_accepted: {
    subject: "Offer Accepted — Next Steps",
    badge: "OFFER ACCEPTED",
    color: "#D4A84B",
    cta: "Continue in Your Portal",
    intro:
      "Thank you for accepting your offer! We'll now move you into the pre-employment phase.",
    bullets: [
      "Your contract and employment details are being arranged",
      "You'll receive your pre-employment checklist next",
      "Start gathering your documents early",
    ],
    closing:
      "Our team is here to make your transition smooth. Watch your portal for what's next.",
  },

  pre_employment: {
    subject: "Pre-Employment — Get Your Documents Ready",
    badge: "PRE-EMPLOYMENT",
    color: "#6D28D9",
    cta: "View Your Checklist",
    intro:
      "Welcome to the pre-employment phase! Before your placement is confirmed, you'll need the following in order. We believe you have most of these — if you don't, now is the time to get them ready.",
    bullets: [
      "Valid passport (with at least 18 months validity)",
      "Professional licenses and academic certificates",
      "DataFlow / credential verification",
      "Destination licensure / registration (e.g. Mumaris, SCFHS)",
      "Exam readiness where required (e.g. Prometric)",
      "Police clearance / certificate of good conduct",
      "Updated CV and references",
    ],
    closing:
      "If you already have these, upload them to your portal. If you're missing any, start now — and don't worry: ELAB can assist with DataFlow processing, licensing and exam preparation. Reply to this email or reach out to your recruiter, and we'll help you get everything ready for the next stage: Placement Confirmed.",
  },

  placement_confirmed: {
    subject: "Your Placement Is Confirmed",
    badge: "PLACEMENT CONFIRMED",
    color: "#6D28D9",
    cta: "View Your Placement",
    intro: "Wonderful news — your placement is confirmed! Here's what happens next.",
    bullets: [
      "Your employer and start details are set",
      "We'll coordinate your relocation and onboarding",
      "Keep your documents ready for the final checks",
    ],
    closing:
      "Our team will be with you every step of the way as you move toward your start date.",
  },

  started_employment: {
    subject: "Welcome Aboard — First Week",
    badge: "WELCOME ABOARD",
    color: "#10B981",
    cta: "Visit Your Portal",
    intro:
      "Welcome aboard! You've officially started employment. We're so proud of what you've achieved.",
    bullets: [
      "Complete your first-week onboarding",
      "Keep our team updated on your first days",
      "Reach out if you need any support settling in",
    ],
    closing:
      "If you know other healthcare professionals ready for an international career, we'd love to work with them too. Thank you for being part of the GlobalHire journey!",
  },
};

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
    // ── Auth: shared secret only (never the public anon key) ──
    const secret = Deno.env.get("INTERNAL_TRIGGER_SECRET");
    const presented = req.headers.get("x-internal-secret");
    if (!secret || presented !== secret) {
      return json({ error: "unauthorized" }, 401);
    }

    // ── Parse ──
    const body = await req.json();
    const applicantId: string = body.applicant_id;
    const newStage: string = body.new_stage;
    const oldStage: string | null = body.old_stage ?? null;
    const triggeredBy: string | null = body.triggered_by ?? null;

    if (!applicantId || !newStage) {
      return json({ error: "applicant_id and new_stage are required" }, 400);
    }

    // ── Stage not configured to email? Silent. ──
    const t = STAGE_TEMPLATES[newStage];
    if (!t) {
      return json({ success: true, skipped: true, reason: "stage_not_configured", stage: newStage });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Get applicant (name from gh_profiles, email from auth.users) ──
    const { data: profile } = await sb
      .from("gh_profiles")
      .select("full_name")
      .eq("id", applicantId)
      .single();

    if (!profile) return json({ error: "Applicant not found" }, 404);

    const { data: authUser } = await sb.auth.admin.getUserById(applicantId);
    if (!authUser?.user?.email) {
      return json({ success: true, skipped: true, reason: "no_email", stage: newStage });
    }

    const applicantEmail = authUser.user.email;
    const applicantName = profile.full_name || "Applicant";
    const portalUrl = (Deno.env.get("SITE_URL") || "https://globalhire.elabsolution.org") + "/portal.html";

    // ── Build branded HTML body ──
    let bodyHtml = '<p style="margin:0 0 20px;font-size:15px;color:#475569;">Hi <strong style="color:#0F172A;">' + esc(applicantName) + '</strong>,</p>';
    bodyHtml += '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">' + esc(t.intro) + '</p>';

    if (t.bullets && t.bullets.length) {
      bodyHtml += '<ul style="margin:0 0 20px;padding-left:20px;">';
      for (const b of t.bullets) {
        bodyHtml += '<li style="font-size:14px;line-height:1.7;color:#475569;margin-bottom:6px;">' + esc(b) + '</li>';
      }
      bodyHtml += '</ul>';
    }

    if (t.closing) {
      bodyHtml += '<p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#475569;">' + esc(t.closing) + '</p>';
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

    const badgeBg = t.color + "15";
    const badgeBorder = t.color + "30";

    const fullHtml = [
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
      '<body style="margin:0;padding:0;background:#F0F4F8;font-family:Segoe UI,Roboto,Helvetica Neue,sans-serif;color:#0F172A;">',
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:40px 20px;"><tr><td align="center">',
      '<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">',
      '<tr><td style="padding:28px 40px 20px;border-bottom:1px solid #E2E8F0;"><table width="100%"><tr>',
      '<td><span style="display:inline-block;width:34px;height:34px;background:#0077B6;border-radius:8px;text-align:center;line-height:34px;font-weight:800;color:#fff;font-size:14px;">G</span></td>',
      '<td style="padding-left:12px;font-size:18px;font-weight:800;color:#0F172A;letter-spacing:-0.3px;">Global<span style="color:#0077B6;">Hire</span></td>',
      '</tr></table></td></tr>',
      '<tr><td style="padding:24px 40px 0;"><span style="display:inline-block;padding:5px 14px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:1px;color:' + t.color + ';background:' + badgeBg + ';border:1px solid ' + badgeBorder + ';">' + t.badge + '</span></td></tr>',
      '<tr><td style="padding:20px 40px 32px;">',
      bodyHtml,
      '<a href="' + portalUrl + '" style="display:inline-block;padding:14px 32px;background:#0077B6;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">' + t.cta + '</a>',
      '<p style="margin:24px 0 0;font-size:13px;color:#94A3B8;">Access your portal: <a href="' + portalUrl + '" style="color:#0077B6;">' + portalUrl + '</a></p>',
      '</td></tr>',
      '<tr><td style="padding:20px 40px;border-top:1px solid #E2E8F0;text-align:center;">',
      '<p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">GlobalHire@eLab — International Healthcare Recruitment</p>',
      '<p style="margin:0;font-size:11px;color:#CBD5E1;">eLab Solutions International LLC</p>',
      '</td></tr></table></td></tr></table></body></html>',
    ].join("\n");

    const plainText =
      "Hi " + applicantName + ",\n\n" +
      t.intro +
      (t.bullets?.length ? "\n\n" + t.bullets.map((b) => "• " + b).join("\n") : "") +
      (t.closing ? "\n\n" + t.closing : "") +
      "\n\nVisit your portal: " + portalUrl +
      "\n\n— GlobalHire@eLab";

    await transport.sendMail({
      from: '"GlobalHire@eLab" <' + smtpUser + '>',
      to: applicantEmail,
      subject: t.subject,
      text: plainText,
      html: fullHtml,
    });

    transport.close();

    // ── Save outbound message to thread (portal + bell) ──
    try {
      await sb.schema("globalhire").from("messages").insert({
        applicant_id: applicantId,
        direction: "outbound",
        subject: t.subject,
        body: plainText,
        sent_at: new Date().toISOString(),
        sent_by_admin: triggeredBy,
      });
    } catch (saveErr) {
      // Non-fatal — email was sent, just log the error
      console.warn("Failed to save message to thread:", saveErr);
    }

    return json({ success: true, sent_to: applicantEmail, stage: newStage, from_stage: oldStage });

  } catch (err) {
    console.error("stage-change-notify error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
