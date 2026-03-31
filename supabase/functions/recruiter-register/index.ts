import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    return json({
      success: true,
      admin_created: adminCreated,
      user_id: userId,
      message: adminCreated
        ? "Recruiter account created and approved."
        : "Registration submitted. An admin will review and approve your account.",
    });

  } catch (err) {
    console.error("recruiter-register error:", err);
    return json({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
