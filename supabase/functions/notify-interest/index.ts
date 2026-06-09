import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

/*
  notify-interest — emails the GlobalHire team the moment a registered applicant
  marks a matched opportunity as "interested".

  Called by a DB trigger (trg_notify_interest) on globalhire.campaign_matches via
  pg_net, so it fires for BOTH response paths:
    - in-portal "Interested" button (direct UPDATE on the table)
    - email-link response (respond_via_token RPC → UPDATE on the table)

  Body: { match_id: uuid }
  Recipient is fixed server-side (INTEREST_NOTIFY_TO env, default support@elabsolution.org)
  — never caller-controlled, so the public anon key cannot be used to exfiltrate PII.
  Caller must present the shared secret header `x-internal-secret` matching
  INTERNAL_TRIGGER_SECRET; the DB trigger supplies it. Other callers are rejected 401.
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    // Only the DB trigger (which holds the secret) may invoke this. The anon key
    // alone is not sufficient — prevents PII exfiltration via this endpoint.
    const secret = Deno.env.get("INTERNAL_TRIGGER_SECRET");
    if (!secret || req.headers.get("x-internal-secret") !== secret) {
      return json({ error: "unauthorized" }, 401);
    }

    const { match_id } = await req.json();
    if (!match_id) return json({ error: "match_id is required" }, 400);

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Match row
    const { data: match, error: matchErr } = await svc
      .schema("globalhire")
      .from("campaign_matches")
      .select("id, response, responded_at, response_note, match_score, applicant_id, campaign_id")
      .eq("id", match_id)
      .single();
    if (matchErr || !match) return json({ error: "match not found" }, 404);

    // Only notify on genuine interest (defensive — trigger already filters).
    if (match.response !== "interested") {
      return json({ skipped: true, reason: `response is '${match.response}', not 'interested'` });
    }

    // 2. Campaign details
    const { data: campaign } = await svc
      .schema("globalhire")
      .from("campaigns")
      .select("title, destination_country, specialty, employer_name")
      .eq("id", match.campaign_id)
      .single();

    // 3. Applicant contact details (email from auth, phone from profile)
    const { data: authUser } = await svc.auth.admin.getUserById(match.applicant_id);
    const applicantEmail = authUser?.user?.email || "—";
    const { data: prof } = await svc
      .schema("globalhire")
      .from("profiles")
      .select("full_name, phone, specialty, years_of_experience, preferred_destinations")
      .eq("id", match.applicant_id)
      .single();

    const name = prof?.full_name || "Applicant";
    const roleTitle = campaign?.title || "an opportunity";
    const destination = campaign?.destination_country || "";
    const phone = prof?.phone || "—";
    const whenStr = match.responded_at || new Date().toISOString();

    // 4. Send the alert
    const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "support@elabsolution.org";
    const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS");
    if (!smtpPass) return json({ error: "SMTP credentials not configured" }, 500);

    const to = Deno.env.get("INTEREST_NOTIFY_TO") || "support@elabsolution.org";

    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    // Header-safe: strip CR/LF/tabs/control chars and cap length (prevents email
    // header injection via attacker-controlled profile full_name / campaign title).
    const headerSafe = (s: string) =>
      String(s).replace(/[\r\n\t]+/g, " ").replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, 120);
    const subject = `🟢 Interested: ${headerSafe(name)} — ${headerSafe(roleTitle)}`;
    const text =
      `${name} just marked themselves INTERESTED in "${roleTitle}"${destination ? ` (${destination})` : ""}.\n\n` +
      `Email: ${applicantEmail}\nPhone: ${phone}\n` +
      `Profile specialty: ${prof?.specialty || "—"}\nExperience: ${prof?.years_of_experience ?? "—"} years\n` +
      `Match score: ${match.match_score ?? "—"}\nResponded: ${whenStr}\n` +
      (match.response_note ? `Note: ${match.response_note}\n` : "") +
      `\nReview in the recruitment dashboard: https://globalhire.elabsolution.org/campaign.html`;

    const html = buildHtml({
      name, roleTitle, destination, applicantEmail, phone,
      specialty: prof?.specialty || "—",
      experience: prof?.years_of_experience ?? "—",
      score: match.match_score ?? "—",
      when: whenStr,
      note: match.response_note || "",
    });

    await transport.sendMail({
      from: `"GlobalHire Alerts" <${smtpUser}>`,
      to,
      subject,
      text,
      html,
    });
    transport.close();

    console.log(`notify-interest sent for match ${match_id} (${name} → ${roleTitle}) to ${to}`);
    return json({ success: true, sent_to: to, applicant: name, role: roleTitle });
  } catch (err) {
    console.error("notify-interest error:", err);
    return json({ error: (err as Error)?.message || "Internal server error" }, 500);
  }
});

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHtml(d: {
  name: string; roleTitle: string; destination: string; applicantEmail: string;
  phone: string; specialty: string; experience: string | number; score: string | number;
  when: string; note: string;
}): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px;color:#5a5f73;font-size:13px;white-space:nowrap;">${label}</td>` +
    `<td style="padding:6px 12px;color:#e0e4ec;font-size:13px;font-weight:600;">${esc(value)}</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0c10;font-family:'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0c10;padding:32px 16px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#12151c;border:1px solid #1e2230;border-radius:14px;overflow:hidden;">
  <tr><td style="padding:22px 28px;border-bottom:1px solid #1e2230;">
    <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(0,232,157,0.12);color:#00e89d;font-size:12px;font-weight:700;">NEW INTEREST</span>
    <div style="margin-top:10px;font-size:18px;font-weight:800;color:#e0e4ec;">${esc(d.name)} is interested</div>
    <div style="margin-top:2px;font-size:14px;color:#a0a6b8;">${esc(d.roleTitle)}${d.destination ? " &middot; " + esc(d.destination) : ""}</div>
  </td></tr>
  <tr><td style="padding:14px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${row("Email", d.applicantEmail)}
      ${row("Phone", d.phone)}
      ${row("Specialty", d.specialty)}
      ${row("Experience", String(d.experience) + " years")}
      ${row("Match score", String(d.score))}
      ${row("Responded", d.when)}
      ${d.note ? row("Note", d.note) : ""}
    </table>
  </td></tr>
  <tr><td style="padding:18px 28px;border-top:1px solid #1e2230;">
    <a href="https://globalhire.elabsolution.org/campaign.html" style="display:inline-block;padding:11px 22px;background:linear-gradient(135deg,#00c484,#00e89d);color:#080a0d;font-size:14px;font-weight:700;text-decoration:none;border-radius:9px;">Open Recruitment Dashboard</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
