import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const CLAUDE_MODEL = "claude-3-5-sonnet-20241022";

const ALL_DOC_TYPES: Record<string, string> = {
  license: "Professional License",
  degree: "Degree / Certificate",
  passport: "Passport (Data Page)",
  cv: "CV / Resume",
  passport_photo: "Passport Photo",
  police_report: "Police Character Report",
  travel_insurance: "Travel Insurance",
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
    // ── Auth ──
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

    const { data: adminProfile } = await sb
      .from("gh_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!adminProfile || adminProfile.role !== "admin") {
      return json({ error: "Admin access required" }, 403);
    }

    // ── Parse ──
    const { applicant_id } = await req.json();
    if (!applicant_id) return json({ error: "applicant_id required" }, 400);

    // ── Fetch applicant profile ──
    const { data: profile } = await sb
      .from("gh_profiles")
      .select("full_name, specialty, specialty_detail, country_of_origin, years_of_experience, preferred_destinations, phone, license_number, profile_completed")
      .eq("id", applicant_id)
      .single();

    if (!profile) return json({ error: "Applicant not found" }, 404);

    // ── Fetch uploaded documents ──
    const { data: docs } = await sb
      .from("gh_documents")
      .select("doc_type, status, file_name, reviewer_notes, uploaded_at")
      .eq("applicant_id", applicant_id)
      .order("uploaded_at", { ascending: true });

    const uploadedDocs = docs || [];

    // ── Assess what's missing / has issues ──
    const uploadedTypes = new Set(uploadedDocs.map((d: any) => d.doc_type));
    const rejectedDocs = uploadedDocs.filter((d: any) => d.status === "rejected");
    const pendingDocs = uploadedDocs.filter((d: any) => d.status === "pending");
    const verifiedDocs = uploadedDocs.filter((d: any) => d.status === "verified");

    const missingTypes = Object.keys(ALL_DOC_TYPES).filter(
      (t) => !uploadedTypes.has(t)
    );

    // ── Build context for Claude ──
    const profileLines = [
      "Applicant: " + (profile.full_name || "Unknown"),
      "Specialty: " + (profile.specialty || "Not specified"),
      profile.specialty_detail ? "Specialty detail: " + profile.specialty_detail : "",
      "Country of origin: " + (profile.country_of_origin || "Not specified"),
      "Years of experience: " + (profile.years_of_experience != null ? profile.years_of_experience : "Not specified"),
      "Preferred destinations: " + (profile.preferred_destinations?.join(", ") || "None selected"),
      "Profile complete: " + (profile.profile_completed ? "Yes" : "No"),
      "License number on file: " + (profile.license_number ? "Yes" : "No"),
    ].filter(Boolean).join("\n");

    let docLines = "";
    if (uploadedDocs.length === 0) {
      docLines = "No documents have been uploaded yet.";
    } else {
      docLines = "Uploaded documents:\n" + uploadedDocs.map((d: any) => {
        const label = ALL_DOC_TYPES[(d as any).doc_type] || (d as any).doc_type;
        let line = "- " + label + ": " + (d as any).status;
        if ((d as any).status === "rejected" && (d as any).reviewer_notes) {
          line += " (Reason: " + (d as any).reviewer_notes + ")";
        }
        return line;
      }).join("\n");

      if (missingTypes.length > 0) {
        docLines += "\n\nMissing documents still required:\n" + missingTypes.map((t) => "- " + ALL_DOC_TYPES[t]).join("\n");
      }
    }

    const profileComplete = profile.profile_completed;
    const totalDocs = uploadedDocs.length;
    const hasRejections = rejectedDocs.length > 0;
    const hasMissing = missingTypes.length > 0;
    const allVerified = verifiedDocs.length === Object.keys(ALL_DOC_TYPES).length;

    let situation = "";
    if (totalDocs === 0) {
      situation = "The applicant has not uploaded any documents. Encourage them to start uploading.";
    } else if (hasRejections) {
      situation = "Some documents were rejected and need to be re-uploaded. Be specific about which ones and mention they should log into the portal.";
    } else if (hasMissing) {
      situation = "Some documents are still missing. Remind them to complete their submission.";
    } else if (pendingDocs.length > 0) {
      situation = "All documents have been submitted and are awaiting review. Acknowledge this and let them know they'll hear back soon.";
    } else if (allVerified) {
      situation = "All documents are verified. This is a congratulatory/next-steps message.";
    } else {
      situation = "The application is progressing. Provide a status update and encourage next steps.";
    }

    const systemPrompt = `You are a professional recruitment coordinator at GlobalHire, an international healthcare recruitment platform run by eLab Solutions International LLC.

Your job is to draft warm, professional email messages to healthcare professional applicants (nurses, doctors, allied health).

Tone: professional yet approachable, warm, encouraging. Never robotic. Use the applicant's first name. Reference their specialty to show personalization. Sign off as "The GlobalHire Recruitment Team".

Output ONLY valid JSON in this exact format — no markdown, no code fences:
{
  "subject": "Email subject line",
  "body": "Full email body text (plain text, not HTML). Use line breaks for paragraphs."
}`;

    const userPrompt = `Draft a recruitment follow-up email based on this applicant context:

${profileLines}

${docLines}

Situation: ${situation}

The email should be warm, specific to their situation, and clearly indicate what action they need to take (if any). Include a reminder to log in at: https://globalhire.elabsolution.org/portal.html

Keep body under 200 words.`;

    // ── Call Claude ──
    if (!ANTHROPIC_API_KEY) {
      return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      return json({ error: "AI draft failed: " + claudeResp.status + " — " + errText.substring(0, 200) }, 500);
    }

    const claudeData = await claudeResp.json();
    const textBlock = claudeData.content?.find((b: any) => b.type === "text");
    if (!textBlock?.text) return json({ error: "No response from AI" }, 500);

    let raw = textBlock.text.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    let draft: any;
    try {
      draft = JSON.parse(raw);
    } catch {
      return json({ error: "Failed to parse AI draft", raw }, 500);
    }

    return json({
      success: true,
      subject: draft.subject || "Update from GlobalHire",
      body: draft.body || "",
      context: {
        total_docs: totalDocs,
        missing_count: missingTypes.length,
        rejected_count: rejectedDocs.length,
        verified_count: verifiedDocs.length,
      },
    });

  } catch (err) {
    console.error("draft-message error:", err);
    return json({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
