import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";
import { buildEmailHtml, renderBulletsHtml } from "../_shared/gh-email-shell.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, x-internal-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  profile-reminder — asks applicants with an incomplete profile to finish it.

  "Complete" matches the portal: specialty + country + phone (js/portal.js).
  Who gets an email, and which one, is decided in SQL by
  globalhire.profile_reminder_candidates() (schema-v46): a first note, then at
  most ONE follow-up after the cool-off, never more. This function only sends.

  Safe by construction:
  - auth is the internal shared secret only (same as stage-change-notify);
  - the kill switch globalhire.automation_flags.profile_reminders ships OFF;
  - sends at most `limit` per call (default 20, hard cap 40), one at a time on
    a single pooled SMTP connection (Gmail 454 / timeout lesson from bulk sends);
  - dry_run returns who WOULD be emailed (names + missing fields, no addresses);
  - every send/failure is recorded in globalhire.profile_reminders, and every
    sent email also lands in the applicant's portal thread (globalhire.messages).

  Copy never mentions automation or pipeline stages.
*/

type Kind = "first" | "followup";
type Missing = "specialty" | "country" | "phone";

const MISSING_BULLETS: Record<Missing, string> = {
  specialty: "Your specialty — for example ICU Nursing, General Practice or Radiology",
  country: "Your country",
  phone: "Your phone number, so our team can reach you about suitable roles",
};

const MISSING_PLAIN: Record<Missing, string> = {
  specialty: "your specialty",
  country: "your country",
  phone: "your phone number",
};

export function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "OJUKWU ANTHONY CHIDUBEM" -> "Ojukwu Anthony Chidubem" (stored names are often all-caps). */
export function niceName(raw: string | null | undefined): string {
  const n = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!n) return "there";
  return n.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, p, c) => p + c.toUpperCase());
}

// ── Pure builder — exported so it is unit-testable ──
export function buildReminderEmail(
  kind: Kind,
  fullName: string | null,
  missing: Missing[],
  hasDocs: boolean,
  portalUrl: string,
  logoUrl: string,
): { subject: string; html: string; text: string } {
  const name = niceName(fullName);
  const hasName = (fullName ?? "").trim() !== "";
  const subject = kind === "first"
    ? "One quick step to complete your GlobalHire profile"
    : "Your GlobalHire profile is still incomplete";

  const intro = kind === "first"
    ? (hasDocs
      ? "We have received your documents and our team is looking at them. To match you with the right employers, we still need a little more from you:"
      : "Thank you for registering with GlobalHire. To match you with the right employers, we still need a little more from you:")
    : "A quick reminder: your GlobalHire profile is still missing a few details, and we cannot match you with employers until it is complete:";

  const bullets = missing.map((m) => MISSING_BULLETS[m]);
  const closing = "It takes about two minutes. Once it is done, your application is fully in order. If you need any help, simply reply to this email.";

  const bodyHtml =
    '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">' + esc(intro) + "</p>" +
    '<table role="presentation" width="100%">' + renderBulletsHtml(bullets.map(esc)) + "</table>";

  const html = buildEmailHtml({
    logoUrl,
    eyebrow: kind === "first" ? "YOUR PROFILE" : "REMINDER",
    headline: kind === "first" ? "One last step on your profile." : "Your profile is almost there.",
    greeting: hasName ? "Dear " + esc(name) + "," : "Hello,",
    bodyHtml,
    closingHtml: esc(closing),
    ctaLabel: "Complete My Profile",
    ctaUrl: portalUrl,
    footerSubtitle: "GlobalHire@eLab — International Healthcare Recruitment",
  });

  const text =
    (hasName ? "Dear " + name + "," : "Hello,") + "\n\n" + intro + "\n\n" +
    missing.map((m) => "• " + MISSING_PLAIN[m][0].toUpperCase() + MISSING_PLAIN[m].slice(1)).join("\n") +
    "\n\n" + closing + "\n\nComplete your profile: " + portalUrl + "\n\n— GlobalHire@eLab";

  return { subject, html, text };
}

type Candidate = { applicant_id: string; kind: Kind; missing: Missing[]; has_docs: boolean; full_name: string | null };

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    // ── Auth: shared secret only (never the public anon key) ──
    const secret = Deno.env.get("INTERNAL_TRIGGER_SECRET");
    if (!secret || req.headers.get("x-internal-secret") !== secret) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(Number(body.limit ?? 20) || 20, 40));
    const dryRun = body.dry_run === true;

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const gh = sb.schema("globalhire");

    // ── Kill switch (dry runs are always allowed: they send nothing) ──
    if (!dryRun) {
      const { data: flag } = await gh.from("automation_flags").select("enabled").eq("key", "profile_reminders").maybeSingle();
      if (!flag?.enabled) return json({ success: true, skipped: true, reason: "switch_off" });
    }

    const { data: cands, error: cErr } = await gh.rpc("profile_reminder_candidates", { p_limit: limit });
    if (cErr) return json({ error: "candidate query failed: " + cErr.message }, 500);
    const batch = (cands ?? []) as Candidate[];

    if (dryRun) {
      return json({
        success: true,
        dry_run: true,
        would_send: batch.length,
        batch: batch.map((c) => ({ id: c.applicant_id, name: niceName(c.full_name), kind: c.kind, missing: c.missing, has_docs: c.has_docs })),
      });
    }
    if (batch.length === 0) return json({ success: true, sent: 0, failed: 0 });

    const siteOrigin = Deno.env.get("SITE_URL") || "https://globalhire.elabsolution.org";
    const portalUrl = siteOrigin + "/portal.html";
    const logoUrl = siteOrigin + "/assets/brand/globalhire-logo-white.png";

    const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
    const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");
    if (!smtpPass) return json({ error: "SMTP credentials not configured" }, 500);

    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      pool: true,
      maxConnections: 1,
      auth: { user: smtpUser, pass: smtpPass },
    });

    let sent = 0;
    let failed = 0;
    let consecutiveFails = 0;
    let aborted = false;
    let logBroken = false;
    for (const c of batch) {
      // Circuit breaker: a systematic problem (SMTP login, quota) must not burn
      // every applicant's 3 allowed attempts in one bad run.
      if (consecutiveFails >= 3) { aborted = true; break; }
      const row = { applicant_id: c.applicant_id, kind: c.kind, missing: c.missing };

      try {
        const { data: au } = await sb.auth.admin.getUserById(c.applicant_id);
        const email = au?.user?.email;
        if (!email) {
          // person-specific, not systematic
          const nr = await gh.from("profile_reminders").insert({ ...row, status: "failed", error: "no_email" });
          if (nr.error) { logBroken = true; console.error("log write failed:", nr.error); break; }
          failed++;
          continue;
        }

        // CLAIM FIRST: write the log row BEFORE sending. If the log cannot be written
        // we send nothing, so an email can never exist without its record (an unlogged
        // send would be repeated on every run). The 2026-10-21 canary hit exactly this.
        const claim = await gh.from("profile_reminders").insert({ ...row, status: "sent" }).select("id").single();
        if (claim.error || !claim.data) {
          logBroken = true;
          console.error("log write failed, aborting batch before sending:", claim.error);
          break;
        }

        const mail = buildReminderEmail(c.kind, c.full_name, c.missing, c.has_docs, portalUrl, logoUrl);
        try {
          await transport.sendMail({
            from: '"GlobalHire@eLab" <' + smtpUser + ">",
            to: email,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
          });
        } catch (e) {
          failed++;
          consecutiveFails++;
          await gh.from("profile_reminders")
            .update({ status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "send_error" })
            .eq("id", claim.data.id);
          continue;
        }
        sent++;
        consecutiveFails = 0;

        // portal thread + bell, same as stage emails (non-fatal, but never silent)
        const thread = await gh.from("messages").insert({
          applicant_id: c.applicant_id,
          direction: "outbound",
          subject: mail.subject,
          body: mail.text,
          sent_at: new Date().toISOString(),
          sent_by_admin: null,
        });
        if (thread.error) console.warn("thread save failed:", thread.error);

        await new Promise((r) => setTimeout(r, 1500)); // gentle pacing
      } catch (e) {
        failed++;
        consecutiveFails++;
        console.error("unexpected error for", c.applicant_id, e);
      }
    }
    transport.close();

    if (logBroken) return json({ error: "log_write_failed", sent, failed, attempted: batch.length }, 500);
    return json({ success: true, sent, failed, attempted: batch.length, aborted_after_repeated_failures: aborted });
  } catch (err) {
    console.error("profile-reminder error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
});
