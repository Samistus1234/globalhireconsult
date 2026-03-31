import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
        .update({ recruiter_approved: true })
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
      const { data: recruiters } = await sb.schema("globalhire").from("profiles")
        .select("id, full_name, organization_name, country_of_origin, phone, recruiter_approved, created_at")
        .eq("role", "recruiter")
        .order("created_at", { ascending: false });
      return json({ success: true, recruiters: recruiters || [] });
    }

    return json({ error: "Unknown action" }, 400);

  } catch (err) {
    console.error("manage-recruiter error:", err);
    return json({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
