import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS (inlined) ──
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

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

    // Service client for storage + DB writes
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin
    const { data: profile } = await sb
      .from("gh_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return json({ error: "Admin access required" }, 403);
    }

    // ── Get document ──
    const { document_id } = await req.json();
    if (!document_id) return json({ error: "document_id required" }, 400);

    const { data: doc, error: docErr } = await sb
      .from("gh_documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) return json({ error: "Document not found" }, 404);
    if (!doc.file_path) return json({ error: "Document has no file path" }, 400);

    // ── Download file from storage ──
    const { data: fileData, error: dlErr } = await sb.storage
      .from("gh-applicant-documents")
      .download(doc.file_path);

    if (dlErr || !fileData) {
      return json({ error: "Failed to download file: " + (dlErr?.message || "unknown") }, 500);
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    // Determine media type
    const mime = doc.mime_type || "application/pdf";
    const isImage = mime.startsWith("image/");
    const isPdf = mime === "application/pdf";

    if (!isImage && !isPdf) {
      return json({ error: "Unsupported file type: " + mime }, 400);
    }

    // ── Get applicant name for context ──
    const { data: applicant } = await sb
      .from("gh_profiles")
      .select("full_name")
      .eq("id", doc.applicant_id)
      .single();

    const applicantName = applicant?.full_name || "Unknown";
    const claimedType = doc.doc_type || "unknown";

    // ── Call Claude Vision API ──
    if (!ANTHROPIC_API_KEY) {
      return json({ error: "ANTHROPIC_API_KEY not configured. Set it in Edge Function secrets." }, 500);
    }

    const imageContent: any = isImage
      ? { type: "image", source: { type: "base64", media_type: mime, data: base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

    const prompt = `You are a document verification specialist for a healthcare recruitment platform called GlobalHire.

Analyze this document and provide a structured assessment.

**Context:**
- Applicant name: ${applicantName}
- Claimed document type: ${claimedType}

**Your tasks:**
1. **Identify the document type** — what kind of document is this actually? (passport, degree, certificate, cv, license, police_report, passport_photo, travel_insurance, other)
2. **Extract key text** — extract the main readable text content (names, dates, numbers, institutions). Keep to 500 characters max.
3. **Assess authenticity** — score from 0-100 based on:
   - Does it look like a genuine document (not a screenshot of a screenshot, not obviously edited)?
   - Is it legible and complete (not cropped, not blurry)?
   - Does the format match what you'd expect for this document type?
   - Does the name on the document match the applicant name "${applicantName}"?
4. **Flag issues** — list any concerns (e.g., "Name on document does not match applicant", "Document appears to be a photo of a screen", "Expiry date has passed", "Image is blurry/low quality", "Document appears incomplete")
5. **Confidence** — how confident are you in your analysis (0.0 to 1.0)?

**Respond ONLY with valid JSON** in this exact format:
{
  "doc_type_detected": "passport",
  "extracted_text": "Key text extracted from document...",
  "authenticity_score": 85,
  "confidence": 0.9,
  "flags": ["Flag 1 if any", "Flag 2 if any"],
  "summary": "One-sentence summary of the document and its quality."
}

No markdown, no code fences, just the JSON object.`;

    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: [imageContent, { type: "text", text: prompt }] }],
      }),
    });

    if (!claudeResp.ok) {
      const errBody = await claudeResp.text();
      console.error("Claude API error:", claudeResp.status, errBody);
      return json({ error: "AI analysis failed: " + claudeResp.status }, 500);
    }

    const claudeData = await claudeResp.json();
    const textBlock = claudeData.content?.find((b: any) => b.type === "text");

    if (!textBlock?.text) return json({ error: "No response from AI" }, 500);

    // Parse JSON response — handle potential markdown wrapping
    let analysisText = textBlock.text.trim();
    if (analysisText.startsWith("```")) {
      analysisText = analysisText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    let analysis: any;
    try {
      analysis = JSON.parse(analysisText);
    } catch {
      console.error("Failed to parse Claude response:", analysisText);
      return json({ error: "Failed to parse AI response", raw: analysisText }, 500);
    }

    // ── Save results to database ──
    const authenticity = Math.max(0, Math.min(100, analysis.authenticity_score || 0));

    const { error: updateErr } = await sb
      .from("gh_documents")
      .update({
        authenticity_score: authenticity,
        analysis_results: {
          doc_type_detected: analysis.doc_type_detected || "unknown",
          extracted_text: analysis.extracted_text || "",
          confidence: analysis.confidence || 0,
          flags: analysis.flags || [],
          summary: analysis.summary || "",
          analyzed_at: new Date().toISOString(),
          model: CLAUDE_MODEL,
        },
        status: doc.status === "pending" ? "in_review" : doc.status,
      })
      .eq("id", document_id);

    if (updateErr) {
      console.error("DB update error:", updateErr);
      return json({ error: "Analysis complete but failed to save: " + updateErr.message }, 500);
    }

    return json({
      success: true,
      document_id,
      authenticity_score: authenticity,
      analysis: analysis,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});
