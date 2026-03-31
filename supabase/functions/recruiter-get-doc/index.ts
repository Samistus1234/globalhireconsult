import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/*
  recruiter-get-doc
  ─────────────────
  Generates a signed URL for a document, but only if:
  - Caller is an approved recruiter
  - The document belongs to a candidate assigned to this recruiter
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

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller identity
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // Verify caller is an approved recruiter
    const { data: profile } = await sb
      .schema("globalhire").from("profiles")
      .select("role, recruiter_approved")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "recruiter" || !profile?.recruiter_approved) {
      return json({ error: "Access denied" }, 403);
    }

    const { file_path, applicant_id } = await req.json();
    if (!file_path || !applicant_id) {
      return json({ error: "file_path and applicant_id required" }, 400);
    }

    // Verify this recruiter is assigned to the candidate
    const { data: assignment } = await sb
      .schema("globalhire").from("recruiter_assignments")
      .select("recruiter_id")
      .eq("recruiter_id", user.id)
      .eq("applicant_id", applicant_id)
      .single();

    if (!assignment) {
      return json({ error: "Candidate not assigned to you" }, 403);
    }

    // Generate signed URL using service role (bypasses storage RLS)
    const { data, error: urlErr } = await sb.storage
      .from("gh-applicant-documents")
      .createSignedUrl(file_path, 3600);

    if (urlErr || !data?.signedUrl) {
      return json({ error: urlErr?.message || "Could not generate URL" }, 500);
    }

    return json({ success: true, url: data.signedUrl });

  } catch (err) {
    console.error("recruiter-get-doc error:", err);
    return json({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
