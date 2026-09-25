const { createClient } = require("@supabase/supabase-js");
const { config } = require("dotenv");
config({ path: "/Users/samuel/.hermes/.env" });
const gh_key = process.env.GLOBALHIRE_SERVICE_ROLE_KEY;
const sb = createClient("https://evzhnsugmvtqgmvzwyix.supabase.co", gh_key);
const orgs = require("/Users/samuel/eLab-Placement-Partners/placement_partners_2026-09-25.json");
const s = v => v == null ? null : (Array.isArray(v) ? v.join("; ") : String(v));
const prio = v => (["A","B","C"].includes(String(v||"").trim().toUpperCase()[0]) ? String(v).trim().toUpperCase()[0] : "B");
(async () => {
  const seen = new Set(); const rows = [];
  for (const o of orgs) {
    const key = (o.name||"").toLowerCase().trim(); if (!key || seen.has(key)) continue; seen.add(key);
    rows.push({
      name: o.name, website: s(o.website), region: o._region_batch, hq_country: s(o.hq_country),
      professions: s(o.professions), source_countries: s(o.source_countries), accepts_african: s(o.accepts_african_candidates),
      visa_model: s(o.visa_model), partner_program: s(o.partner_program), partner_program_url: s(o.partner_program_url),
      registration_method: s(o.partner_registration_method), required_docs: s(o.partner_required_docs),
      contact_email: s(o.contact_email), contact_form_url: s(o.contact_form_url), candidate_requirements: s(o.candidate_requirements),
      ethical_cert: s(o.ethical_recruitment_cert), priority: prio(o.priority), research_notes: s(o.notes),
      evidence_urls: Array.isArray(o.evidence_urls) ? o.evidence_urls : (o.evidence_urls ? [String(o.evidence_urls)] : []),
      outreach_status: /alfadhel/i.test(o.name) ? "active" : "not_contacted",
      internal_notes: /alfadhel/i.test(o.name) ? "Existing partner — employer dashboard access; nominations live (watch cron)." : null,
    });
  }
  const { error } = await sb.from("gh_placement_partners").insert(rows);
  if (error) { console.log("ERR", error.message); return; }
  const { count } = await sb.from("gh_placement_partners").select("*", { count: "exact", head: true });
  const { data: stats } = await sb.from("gh_placement_partner_stats").select("*");
  console.log("inserted", rows.length, "table count", count); console.table(stats);
})();
