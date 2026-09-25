// Seed / refresh the partner pack in the partner-pack bucket (service role).
// Usage: node scripts/seed_partner_pack.cjs  (run from ~/elab-ops-monitor, which has deps)
const { createClient } = require("@supabase/supabase-js");
const { config } = require("dotenv");
const fs = require("fs"); const path = require("path");
config({ path: "/Users/samuel/.hermes/.env" });
const gh_key = process.env.GLOBALHIRE_SERVICE_ROLE_KEY;
const sb = createClient("https://evzhnsugmvtqgmvzwyix.supabase.co", gh_key);
const DIR = "/Users/samuel/eLab-Placement-Partners/partner-pack";
const PACK = [
  { sort_order: 1, code: "cac_certificate",     title: "CAC Certificate of Incorporation (RC 1949626)", file: "01-cac-certificate-of-incorporation.pdf", status: "current", attach: true },
  { sort_order: 2, code: "recruiter_licence",   title: "FMLE Recruiter's Licence LAB/EW/001637",       file: "02-recruiter-licence-LAB-EW-001637.pdf", status: "current", attach: true, notes: "Issued 16 Nov 2023, 2-year validity — renewal status to confirm." },
  { sort_order: 3, code: "eapean_membership",   title: "EAPEAN Membership Certificate (EAP 0339)",     file: "03-eapean-membership-certificate-EAP0339.pdf", status: "current", attach: true, notes: "Issued 4 Sept 2026, valid 2 years (to Sept 2028)." },
  { sort_order: 4, code: "company_profile",     title: "Company Profile v2 (Sept 2026)",               file: "04-company-profile.pdf", status: "current", attach: true },
  { sort_order: 6, code: "ethical_declaration", title: "Ethical Recruitment & No-Fee Declaration",     file: "06-ethical-recruitment-declaration.pdf", status: "current", attach: true, notes: "Unsigned draft until MD signs." },
  { sort_order: 7, code: "data_protection",     title: "Data Protection Statement",                    file: "07-data-protection-statement.pdf", status: "current", attach: true, notes: "Unsigned draft until MD signs." },
];
(async () => {
  for (const p of PACK) {
    let file_path = "", file_name = "", size = null;
    if (p.file) {
      const buf = fs.readFileSync(path.join(DIR, p.file));
      file_path = "v2026-09/" + p.file; file_name = p.file; size = buf.length;
      const up = await sb.storage.from("partner-pack").upload(file_path, buf, { contentType: "application/pdf", upsert: true });
      if (up.error) { console.log("upload err", p.file, up.error.message); continue; }
    }
    const row = { sort_order: p.sort_order, code: p.code, title: p.title, file_path, file_name, file_size_bytes: size, attach_by_default: p.attach, status: p.status, notes: p.notes || null, updated_at: new Date().toISOString() };
    const { error } = await sb.from("gh_placement_partner_pack").upsert(row, { onConflict: "code" });
    console.log(p.code, error ? "ERR " + error.message : "ok", size ? (size / 1024 | 0) + "KB" : "(no file)");
  }
  const { data } = await sb.storage.from("partner-pack").list("v2026-09");
  console.log("bucket:", data.map(d => d.name + " " + (d.metadata?.size / 1024 | 0) + "KB").join(" | "));
})();
