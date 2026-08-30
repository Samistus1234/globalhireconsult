import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";
import { buildEmailHtml, renderBulletsHtml, renderAtAGlance } from "../_shared/gh-email-shell.ts";

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
  badge: string;        // gold letterspaced eyebrow in the navy letterhead
  headline: string;     // serif display headline
  cta: string;
  intro: string;
  bullets?: string[];
  closing?: string;
};

// ── The 10 stages that email. Absence = silent. ──
export const STAGE_TEMPLATES: Record<string, Template> = {
  qualified: {
    subject: "You're Qualified — Here's What's Next",
    badge: "QUALIFIED",
    headline: "You're officially Qualified.",
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
    headline: "You've been shortlisted.",
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
    headline: "Your profile is with an employer.",
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
    headline: "An interview is scheduled.",
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
    headline: "Thank you for interviewing.",
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
    headline: "An offer has been extended to you.",
    cta: "Review Your Offer",
    intro:
      "Congratulations! An employer has extended an offer to you. This is a big milestone.",
    bullets: [
      "Review the offer details in your portal",
      "Let us know if you accept, or if you have questions",
      "We'll guide you through the next steps once you respond",
    ],
    closing:
      "Review the letter, then reply Accept to begin pre-employment. Questions about any term? Your recruiter is one message away.",
  },

  offer_accepted: {
    subject: "Offer Accepted — Next Steps",
    badge: "OFFER ACCEPTED",
    headline: "Your offer is accepted.",
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
    headline: "Let's get your documents ready.",
    cta: "View Your Checklist",
    intro:
      "Welcome to the pre-employment phase! Before your placement is confirmed, you'll need the following in order. We believe you have most of these — if you don't, now is the time to get them ready.",
    bullets: [
      "Valid international passport",
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
    headline: "Your placement is confirmed.",
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
    headline: "Welcome aboard.",
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

// ── Pure builder — exported so all 10 stage emails are unit-testable ──
export function buildStageEmail(
  t: Template,
  applicantName: string,
  atAGlance: { employer: string; role: string; location: string; recruiter: string } | null,
  portalUrl: string,
  logoUrl: string
): { html: string; text: string } {
  let bodyHtml = '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">' + esc(t.intro) + '</p>';

  if (atAGlance) {
    bodyHtml += renderAtAGlance(atAGlance);
  } else if (t.bullets && t.bullets.length) {
    bodyHtml +=
      '<div style="margin:4px 0 6px;font-size:10.5px;font-weight:700;letter-spacing:.16em;color:#0A1F44;">WHAT HAPPENS NEXT</div>' +
      '<table role="presentation" width="100%">' + renderBulletsHtml(t.bullets.map((b) => esc(b))) + '</table>';
  }

  const html = buildEmailHtml({
    logoUrl,
    eyebrow: t.badge,
    headline: t.headline,
    greeting: "Dear " + esc(applicantName) + ",",
    bodyHtml,
    closingHtml: t.closing ? esc(t.closing) : undefined,
    ctaLabel: t.cta,
    ctaUrl: portalUrl,
    footerSubtitle: "GlobalHire@eLab — International Healthcare Recruitment",
  });

  const text =
    "Hi " + applicantName + ",\n\n" +
    t.intro +
    (t.bullets?.length ? "\n\n" + t.bullets.map((b) => "• " + b).join("\n") : "") +
    (t.closing ? "\n\n" + t.closing : "") +
    "\n\nVisit your portal: " + portalUrl +
    "\n\n— GlobalHire@eLab";

  return { html, text };
}

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
    const siteOrigin = Deno.env.get("SITE_URL") || "https://globalhire.elabsolution.org";
    const portalUrl = siteOrigin + "/portal.html";
    const logoUrl = siteOrigin + "/assets/brand/globalhire-logo-white.png";

    // ── Offer milestone: pull the active placement for the at-a-glance panel ──
    let atAGlance: { employer: string; role: string; location: string; recruiter: string } | null = null;
    if (newStage === "offer_extended") {
      try {
        const { data: pl } = await sb
          .schema("globalhire")
          .from("placements")
          .select("employer_name,position_title,destination_country")
          .eq("applicant_id", applicantId)
          .order("created_at", { ascending: false })
          .maybeSingle();
        if (pl?.employer_name && pl?.position_title && pl?.destination_country) {
          atAGlance = {
            employer: esc(pl.employer_name),
            role: esc(pl.position_title),
            location: esc(pl.destination_country),
            recruiter: "GlobalHire Talent Team",
          };
        }
      } catch (e) {
        console.warn("placement fetch failed (offer panel omitted):", e);
      }
    }

    // ── Build design-B email (HTML + plain text) ──
    const { html: fullHtml, text: plainText } = buildStageEmail(t, applicantName, atAGlance, portalUrl, logoUrl);

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
    return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
});

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
