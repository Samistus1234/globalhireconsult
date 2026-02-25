import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (req.method === "GET") {
      // Fetch opportunity details by token (no auth required)
      const url = new URL(req.url);
      const token = url.searchParams.get("token");

      if (!token) {
        return new Response(JSON.stringify({ error: "Token is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Query match from public view (includes full_name from join)
      const { data: match, error: matchError } = await serviceClient
        .from("gh_campaign_matches")
        .select("id, campaign_id, match_score, match_reasons, response, responded_at, token_expires_at, applicant_id, full_name")
        .eq("response_token", token)
        .single();

      if (matchError || !match) {
        return new Response(
          JSON.stringify({ error: "Invalid token" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check expiry
      if (new Date(match.token_expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "This link has expired. Please log in to your portal to respond.", expired: true }),
          {
            status: 410,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Get campaign details from public view
      const { data: campaign } = await serviceClient
        .from("gh_campaigns")
        .select("title, specialty, destination_country, salary_display, employer_name, visa_sponsored, description, positions")
        .eq("id", match.campaign_id)
        .single();

      return new Response(
        JSON.stringify({
          match: {
            id: match.id,
            match_score: match.match_score,
            match_reasons: match.match_reasons,
            response: match.response,
            responded_at: match.responded_at,
            applicant_name: match.full_name,
          },
          campaign: campaign || null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (req.method === "POST") {
      // Submit response (no auth required — token-based)
      const { token, response, note } = await req.json();

      if (!token || !response) {
        return new Response(
          JSON.stringify({ error: "token and response are required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Call the PG function (in globalhire schema)
      const { data, error } = await serviceClient.schema("globalhire").rpc("respond_via_token", {
        p_token: token,
        p_response: response,
        p_note: note || null,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
