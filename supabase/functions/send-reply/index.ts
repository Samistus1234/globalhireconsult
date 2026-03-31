import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/*
  send-reply — Called by the applicant portal to submit a reply message.
  Saves an inbound message to globalhire.messages.
*/

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Confirm caller is an applicant
    const { data: profile } = await sb
      .from("gh_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile) return json({ error: "Profile not found" }, 404);

    const { body: msgBody, subject } = await req.json();
    if (!msgBody || !msgBody.trim()) return json({ error: "Message body is required" }, 400);

    // Insert into globalhire.messages via schema selector
    const { error: msgErr } = await sb
      .schema("globalhire")
      .from("messages")
      .insert({
        applicant_id: user.id,
        direction: "inbound",
        subject: subject || "Reply from applicant",
        body: msgBody.trim(),
        sent_at: new Date().toISOString(),
      });

    if (msgErr) {
      console.error("Insert error:", msgErr);
      return json({ error: "Failed to save message: " + msgErr.message }, 500);
    }

    return json({ success: true });

  } catch (err) {
    console.error("send-reply error:", err);
    return json({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
