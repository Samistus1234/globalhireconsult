// gh-visa-sync-push  (GH: evzhnsugmvtqgmvzwyix). Drains globalhire.visa_sync_outbox -> CC receiver.
// Tracked in the repo from live v10 on 2026-11-12; case_created now also carries the
// applicant's passport/nationality/WhatsApp, the sponsor relationship and the travellers.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BATCH = 50, MAX_ATTEMPTS = 5;
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "globalhire" } });
  const ccUrl = Deno.env.get("CC_VISA_SYNC_URL") ?? "";
  const apiKey = Deno.env.get("VISA_SYNC_API_KEY") ?? "";
  if (!ccUrl || !apiKey) return json({ error: "missing CC_VISA_SYNC_URL or VISA_SYNC_API_KEY" }, 500);

  const { data: rows, error } = await sb.from("visa_sync_outbox")
    .select("id, case_id, cc_case_id, change_type, attempts")
    .eq("status", "pending").order("created_at", { ascending: true }).limit(BATCH);
  if (error) return json({ error: error.message }, 500);
  if (!rows?.length) return json({ ok: true, drained: 0, failed: 0, scanned: 0 });

  let done = 0, failed = 0;
  for (const row of rows) {
    try {
      if (row.change_type === "case_created") {
        const { data: vc2, error: vc2Err } = await sb.from("visa_cases")
          .select("cc_case_id, candidate_id, visa_type, status, sponsor_name, sponsor_iqama, travel_dates, estimated_total_usd, applicant_details, sponsor_relationship, travellers")
          .eq("id", row.case_id).maybeSingle();
        if (vc2Err) throw vc2Err;
        if (vc2?.cc_case_id) { // already linked — idempotent
          await sb.from("visa_sync_outbox").update({ status: "done", processed_at: new Date().toISOString() }).eq("id", row.id);
          done++; continue;
        }
        const { data: prof } = await sb.from("profiles").select("full_name, phone").eq("id", vc2?.candidate_id).maybeSingle();
        let email: string | null = null;
        try {
          const { data: au } = await sb.auth.admin.getUserById(vc2?.candidate_id as string);
          email = au?.user?.email ?? null;
        } catch (_) { email = null; }
        const { data: dep } = await sb.from("visa_invoices").select("paid_at").eq("case_id", row.case_id).eq("kind","deposit").not("paid_at","is",null).order("paid_at",{ascending:false}).limit(1).maybeSingle();
        const item = {
          gh_case_id: row.case_id,
          change_type: "case_created",
          visa_type: vc2?.visa_type ?? null,
          status: vc2?.status ?? "deposit_pending",
          applicant: { email, full_name: prof?.full_name ?? null, phone: prof?.phone ?? null },
          applicant_details: vc2?.applicant_details ?? null,
          sponsor_relationship: vc2?.sponsor_relationship ?? null,
          travellers: vc2?.travellers ?? null,
          sponsor_name: vc2?.sponsor_name ?? null,
          sponsor_iqama: vc2?.sponsor_iqama ?? null,
          travel_dates: vc2?.travel_dates ?? null,
          estimated_total_usd: vc2?.estimated_total_usd ?? null,
          deposit_paid_at: dep?.paid_at ?? null,
        };
        const resp = await fetch(ccUrl, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey }, body: JSON.stringify({ items: [item] }) });
        const payload = await resp.json().catch(() => ({}));
        const ccId = payload?.results?.[0]?.cc_case_id;
        if (!(resp.ok && payload?.results?.[0]?.ok === true && ccId)) throw new Error(`cc create rejected: ${resp.status} ${JSON.stringify(payload)}`);
        await sb.from("visa_cases").update({ cc_case_id: ccId }).eq("id", row.case_id);
        await sb.from("visa_sync_outbox").update({ status: "done", processed_at: new Date().toISOString(), cc_case_id: ccId }).eq("id", row.id);
        done++; continue;
      }
      const { data: vc, error: vcErr } = await sb.from("visa_cases")
        .select("cc_case_id, sponsor_name, sponsor_iqama, travel_dates").eq("id", row.case_id).maybeSingle();
      if (vcErr) throw vcErr;
      let deposit_paid_at: string | null = null;
      if (row.change_type === "deposit_paid") {
        const { data: inv } = await sb.from("visa_invoices")
          .select("paid_at").eq("case_id", row.case_id).eq("kind", "deposit")
          .not("paid_at", "is", null).order("paid_at", { ascending: false }).limit(1).maybeSingle();
        deposit_paid_at = inv?.paid_at ?? null;
      }
      let doc_summary: unknown = null;
      if (row.change_type === "doc_update") {
        const { data: docs } = await sb.from("visa_case_documents")
          .select("doc_kind, review_status").eq("case_id", row.case_id);
        const list = docs ?? [];
        doc_summary = {
          total: list.length,
          accepted: list.filter((d: any) => d.review_status === "accepted").length,
          pending: list.filter((d: any) => d.review_status !== "accepted").length,
          kinds: [...new Set(list.map((d: any) => d.doc_kind))],
        };
      }
      const item = {
        cc_case_id: row.cc_case_id ?? vc?.cc_case_id ?? null,
        gh_case_id: row.case_id,
        change_type: row.change_type,
        deposit_paid_at,
        sponsor_name: vc?.sponsor_name ?? null,
        sponsor_iqama: vc?.sponsor_iqama ?? null,
        travel_dates: vc?.travel_dates ?? null,
        doc_summary,
      };
      const resp = await fetch(ccUrl, {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ items: [item] }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!(resp.ok && payload?.results?.[0]?.ok === true)) {
        throw new Error(`cc rejected: ${resp.status} ${JSON.stringify(payload)}`);
      }
      await sb.from("visa_sync_outbox").update({ status: "done", processed_at: new Date().toISOString() }).eq("id", row.id);
      done++;
    } catch (e) {
      const attempts = (row.attempts ?? 0) + 1;
      await sb.from("visa_sync_outbox").update({
        attempts, last_error: e instanceof Error ? e.message : String(e),
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
      }).eq("id", row.id);
      failed++;
    }
  }
  return json({ ok: true, drained: done, failed, scanned: rows.length });
});
