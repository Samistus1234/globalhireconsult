import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  sync-marketing-suppression — cross-DB opt-out suppression bridge (Plan 2, Task 4)

  Two databases share no recruiter key: GlobalHire (`evzhnsugmvtqgmvzwyix`, this
  project — recruiters + their candidates) and the ELAB Command Centre / ops CRM
  (`fwmhfwprvqaovidykaqt` — where marketing campaigns are actually sent from,
  via `email_contacts`). The bridge links the two by normalized (lowercased,
  trimmed) email.

  What it does:
    1. In GlobalHire, finds recruiters with `allow_direct_marketing = false`
       and collects their candidates' emails from two sources:
         a. `globalhire.recruiter_submitted_candidates.email` (direct column).
         b. `globalhire.recruiter_assignments` (recruiter_id, applicant_id) →
            `globalhire.profiles.id`. profiles has NO email column (see
            notify-recruiter-status for the same note) — the email lives on
            auth.users, resolved here via `auth.admin.listUsers()` (service
            role). If an assigned applicant's auth user can't be resolved
            (deleted account, pagination edge case), it is skipped and counted
            in `unresolved_profile_emails` rather than silently guessed.
    2. Against the Command Centre (service-role client, project
       `fwmhfwprvqaovidykaqt`, env OPS_SUPABASE_URL / OPS_SERVICE_ROLE_KEY /
       OPS_ORG_ID — the same secrets already provisioned on this project for
       ops/CRM cross-project calls), sets
       `email_contacts.do_not_market = true, marketing_optout_reason =
       'recruiter_optout'` for every `email_contacts` row (scoped to
       OPS_ORG_ID) whose lowercased email is in the opt-out set AND is not
       ALREADY suppressed. Rows already `do_not_market = true` for any reason
       (e.g. a genuine unsubscribe) are left completely untouched — we never
       overwrite an existing `marketing_optout_reason`, so we can never later
       clobber then re-subscribe a genuine opt-out.
    3. Re-include path: any `email_contacts` row that currently has
       `marketing_optout_reason = 'recruiter_optout'` but whose email is NO
       LONGER in the opt-out set (recruiter toggled back on, or the candidate
       row was removed) gets `do_not_market` cleared back to false and the
       reason cleared. Rows opted out for any OTHER reason (e.g. a genuine
       unsubscribe) are never touched — only the exact `recruiter_optout`
       marker is reversible here.
    4. Idempotent: running it repeatedly with no underlying change is a no-op
       (both `cc_flagged` and `cc_cleared` come back 0).

  Auth: admin-only. Same gate as promote-recruiter-submission /
  notify-recruiter-status — caller must send a real logged-in admin's session
  Authorization header; verified against `globalhire.profiles.role = 'admin'`
  via the service-role client. This is a cross-DB write using a service-role
  key against ANOTHER project, so it must never be left open.

  Triggers: (a) fire-and-forget from the admin "Direct marketing" toggle in
  js/recruiters-admin.js right after a successful allow_direct_marketing
  update; (b) a manual "Sync suppression" button on recruiters.html for
  ad-hoc/backfill runs.
*/

const REASON = "recruiter_optout";

async function buildEmailMapForIds(
  // deno-lint-ignore no-explicit-any
  sb: any,
  ids: Set<string>,
): Promise<{ map: Map<string, string>; unresolved: number }> {
  const map = new Map<string, string>();
  if (ids.size === 0) return { map, unresolved: 0 };

  const perPage = 1000;
  let page = 1;
  // Bounded loop: GoTrue listUsers is paginated; stop once we've either found
  // every id we need or run out of pages. Hard cap avoids a runaway loop if
  // the auth API ever returns a non-decreasing page forever.
  for (let i = 0; i < 50; i++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("listUsers error:", error.message || error);
      break;
    }
    const users = data?.users ?? [];
    for (const u of users) {
      if (ids.has(u.id) && u.email) map.set(u.id, u.email);
    }
    if (users.length < perPage) break; // last page
    if (map.size === ids.size) break; // found everything we need
    page++;
  }

  return { map, unresolved: ids.size - map.size };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Admin auth check (same pattern as promote-recruiter-submission) ──
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

    // ── Step 1: gather opt-out recruiters + their candidate emails ──
    const { data: optOutRecruiters, error: recruitersErr } = await sb
      .schema("globalhire").from("profiles")
      .select("id, full_name")
      .eq("allow_direct_marketing", false);
    if (recruitersErr) return json({ error: "Failed to load recruiters: " + recruitersErr.message }, 500);

    const optOutIds = (optOutRecruiters ?? []).map((r: { id: string }) => r.id);

    const rawEmails: string[] = [];
    let unresolvedProfileEmails = 0;

    if (optOutIds.length > 0) {
      const { data: submitted, error: submittedErr } = await sb
        .schema("globalhire").from("recruiter_submitted_candidates")
        .select("email")
        .in("recruiter_id", optOutIds)
        .not("email", "is", null);
      if (submittedErr) return json({ error: "Failed to load submitted candidates: " + submittedErr.message }, 500);
      for (const row of submitted ?? []) if (row.email) rawEmails.push(row.email);

      const { data: assignments, error: assignErr } = await sb
        .schema("globalhire").from("recruiter_assignments")
        .select("applicant_id")
        .in("recruiter_id", optOutIds);
      if (assignErr) return json({ error: "Failed to load recruiter assignments: " + assignErr.message }, 500);

      const applicantIds = new Set((assignments ?? []).map((a: { applicant_id: string }) => a.applicant_id));
      if (applicantIds.size > 0) {
        const { map: emailMap, unresolved } = await buildEmailMapForIds(sb, applicantIds);
        unresolvedProfileEmails = unresolved;
        for (const email of emailMap.values()) rawEmails.push(email);
      }
    }

    const optOutEmailSet = new Set(
      rawEmails.map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0),
    );

    // ── Step 2 + 3: reconcile against the Command Centre ──
    const ccUrl = Deno.env.get("OPS_SUPABASE_URL");
    const ccKey = Deno.env.get("OPS_SERVICE_ROLE_KEY");
    const ccOrgId = Deno.env.get("OPS_ORG_ID");
    if (!ccUrl || !ccKey || !ccOrgId) {
      return json({ error: "Command Centre secrets (OPS_SUPABASE_URL/OPS_SERVICE_ROLE_KEY/OPS_ORG_ID) not configured" }, 500);
    }
    const cc = createClient(ccUrl, ccKey);

    // Page through the FULL email_contacts set — PostgREST caps a single
    // response at ~1000 rows and this table is already ~900+, so an unpaginated
    // fetch would silently drop rows past the cap and miss suppressing them (a
    // compliance gap). Bounded loop, same style as buildEmailMapForIds above.
    const PAGE = 1000;
    const ccContacts: Array<{ id: string; email: string | null; do_not_market: boolean | null; marketing_optout_reason: string | null }> = [];
    for (let offset = 0; offset < 500_000; offset += PAGE) {
      const { data, error: ccErr } = await cc
        .from("email_contacts")
        .select("id, email, do_not_market, marketing_optout_reason")
        .eq("org_id", ccOrgId)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (ccErr) return json({ error: "Failed to load email_contacts: " + ccErr.message }, 500);
      const rows = data ?? [];
      for (const r of rows) ccContacts.push(r);
      if (rows.length < PAGE) break; // short page → last page
    }

    const toFlag: string[] = [];
    const toClear: string[] = [];
    for (const c of ccContacts ?? []) {
      const norm = (c.email || "").trim().toLowerCase();
      const shouldSuppress = optOutEmailSet.has(norm);
      const currentlySuppressed = c.do_not_market === true;
      const flaggedByUs = currentlySuppressed && c.marketing_optout_reason === REASON;
      if (shouldSuppress && !currentlySuppressed) {
        // Only suppress rows that are NOT already opted out. A row already
        // do_not_market=true for ANY reason (e.g. a genuine unsubscribe) is
        // left completely untouched — we never overwrite its
        // marketing_optout_reason, so we can never later "re-subscribe" a
        // genuine opt-out via the clear path below.
        toFlag.push(c.id);
      } else if (!shouldSuppress && flaggedByUs) {
        // Only clear rows WE flagged (reason === 'recruiter_optout'); genuine
        // opt-outs with any other reason are never cleared.
        toClear.push(c.id);
      }
    }

    if (toFlag.length > 0) {
      const { error } = await cc.from("email_contacts")
        .update({ do_not_market: true, marketing_optout_reason: REASON })
        .in("id", toFlag);
      if (error) return json({ error: "Failed to flag suppressed contacts: " + error.message }, 500);
    }
    if (toClear.length > 0) {
      const { error } = await cc.from("email_contacts")
        .update({ do_not_market: false, marketing_optout_reason: null })
        .in("id", toClear);
      if (error) return json({ error: "Failed to clear reverted contacts: " + error.message }, 500);
    }

    return json({
      ok: true,
      opt_out_recruiters: optOutIds.length,
      opt_out_emails: optOutEmailSet.size,
      unresolved_profile_emails: unresolvedProfileEmails,
      cc_flagged: toFlag.length,
      cc_cleared: toClear.length,
    });
  } catch (err) {
    console.error("sync-marketing-suppression error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
