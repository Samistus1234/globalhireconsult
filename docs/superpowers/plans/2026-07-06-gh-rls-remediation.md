# GlobalHire gh_* RLS Remediation — Implementation Plan

> Executes the P0 fix mapped in `.superpowers/sdd/rls-remediation-map.md` (read it for per-table detail). 35 of 39 `public.gh_*` views bypass RLS (postgres-owned, non-invoker) → anon/authenticated can read/write `globalhire.*` ignoring RLS (privilege escalation). Fix = flip views to `security_invoker=true` + add the RLS policies/triggers legitimate flows need, atomically. Project `evzhnsugmvtqgmvzwyix` (PRODUCTION). Apply via Supabase MCP `apply_migration`; save each SQL to `schema-v20+…sql`.

**Every task's dual acceptance:** (1) the exploit/over-permission is CLOSED (verify as a non-admin/anon), and (2) the legitimate flows in the map's §3 still work (verify as the right role). Re-run `get_advisors(type=security)` after each. Reversible auth-context test pattern (rolled-back, like the A1 IDOR test) is the verification tool.

## Global Constraints
- Use `globalhire.is_admin()` (confirmed SECURITY DEFINER, safe) for admin policies.
- Trigger exemption pattern (copy `globalhire.gh_rsc_review_guard`): `IF globalhire.is_admin() OR auth.uid() IS NULL THEN RETURN NEW; END IF;` then block protected changes.
- Do NOT add anon/non-admin INSERT policy on `profiles` (creation is via the SECURITY DEFINER `handle_new_user` trigger).
- Atomic: each migration flips its view(s) AND adds the policies/trigger in ONE migration — never flip/enable-RLS without the covering policy in the same transaction (silent zero-rows / broken flows otherwise).

---

### Task R1: `gh_profiles` — the privilege-escalation fix (HIGHEST PRIORITY, atomic)
Migration `v20_gh_profiles_rls`. Do ALL three together:
1. `ALTER VIEW public.gh_profiles SET (security_invoker = true);`
2. ADD admin UPDATE policy: `CREATE POLICY gh_admins_update_all_profiles ON globalhire.profiles FOR UPDATE TO authenticated USING (globalhire.is_admin()) WITH CHECK (globalhire.is_admin());` (keeps `recruiters-admin.js:178` marketing toggle + `candidates.js:843,1390` pipeline/milestone edits working).
3. ADD a BEFORE UPDATE trigger `gh_profiles_column_guard` on `globalhire.profiles`: exempt admins/`auth.uid() IS NULL`; else RAISE if any of these changed vs OLD: `role, recruiter_approved, pipeline_stage, migration_status, current_stage, dataflow_completed, dataflow_number, dataflow_country, dataflow_via_elab, allow_direct_marketing`. (Own-row non-admin updates of phone/specialty/etc. still pass — `js/auth.js:211`.)

**Verify:** (a) as a synthetic non-admin session (rolled back): `update ... set role='admin' where id=<own>` → DENIED by trigger; `update phone` on own row → OK. (b) as admin (is_admin true): update another profile's `allow_direct_marketing` / `pipeline_stage` → OK. (c) advisor `security_definer_view` count drops by 1.

---

### Task R2: `gh_campaign_matches` — applicant respond flow (atomic)
Migration `v21_gh_campaign_matches_rls`. `ALTER VIEW public.gh_campaign_matches SET (security_invoker=true);` and `public.gh_campaign_matches_write` same. ADD applicant UPDATE policy on `globalhire.campaign_matches`: `USING (applicant_id=auth.uid()) WITH CHECK (applicant_id=auth.uid())`, plus a column-guard trigger restricting non-admins to changing only `response, response_note, responded_at` (block `match_score`, `email_status`, etc.). Keeps `portal.js:876` working.
**Verify:** applicant (synthetic) updates own match `response` → OK; updates `match_score` → DENIED; updates ANOTHER applicant's match → DENIED; admin ALL still works.

---

### Task R3: `messages` — enable RLS + inbox policies (atomic)
Migration `v22_messages_rls`. `ALTER TABLE globalhire.messages ENABLE ROW LEVEL SECURITY;` ADD SELECT policies: applicant-own (`applicant_id=auth.uid()`), admin-all (`globalhire.is_admin()`). Flip `gh_messages` + `gh_inbox` to `security_invoker=true`. FIRST confirm no client INSERT path (map found none — writes are edge-fn/service-role); if none, omit INSERT policy (service-role bypasses RLS).
**Verify:** applicant sees only own messages; admin sees all; anon sees none; `portal.js:1110` + admin inbox flows return rows (not zero).

---

### Task R4: `recruiter_assignments` + `recruiter_notes` — enable RLS (atomic)
Migration `v23_recruiter_tables_rls`. `ENABLE ROW LEVEL SECURITY` on both. ADD SELECT policies: recruiter-own (`recruiter_id=auth.uid()`), admin-all. Flip `gh_recruiter_assignments` + `gh_recruiter_notes` to `security_invoker=true`. No client write path found (writes via `manage-recruiter` edge fn) — omit write policies. Confirm no missed insert path before enabling.
**Verify:** recruiter sees only own assignments/notes; admin all; the recruiter portal (`recruiter.js:192`) + admin candidate panel (`candidates.js:668,519`) lists return rows.

---

### Task R5: low-risk batch — flip remaining views (no new policies)
Migration `v24_gh_views_invoker_batch`. `SET (security_invoker=true)` on the ~26 remaining vulnerable views listed in map §6.5 (documents, verification_audit, registry_checks, placements + placement_*, campaigns, campaign_applications*, campaign_activity_log, merged_documents, my_applications, my_opportunities, my_placements, job_applications, saved_jobs, ai_recommendations, event_registrations, job_alert_subscribers, partner_submissions, articles, countries, events, guides, jobs). Existing policies already cover all found write/read paths. BEFORE shipping, resolve map §6.6: check `globalhire.admin_applicant_overview` (the nested view behind `gh_admin_applicant_overview`) — if it's itself a non-invoker view over profiles/documents, it needs `security_invoker=true` too (view chains don't inherit). Test a non-admin read of `gh_admin_applicant_overview` returns appropriately restricted rows.
**Verify:** advisor `security_definer_view` for gh_* views → 0. Spot-check anon public reads (jobs/guides/countries) still work; admin document/placement/verification writes still work.

---

### Task R6: `visa_sync_outbox` RLS (defense-in-depth)
Migration `v25_visa_sync_outbox_rls`. `ENABLE ROW LEVEL SECURITY` (no gh_ view; internal queue written by triggers/edge fns/service-role). No anon/authenticated policies needed.
**Verify:** the visa-sync edge functions (service-role) still write; advisor clean.

---

### Task R7: admin-visa UI auth guards (independent of views)
Add `js/auth-guard.js` + `data-auth-role="admin"` to `admin-visas.html` and `admin-visa-case.html` (they currently load no guard — any logged-in user can open the admin visa UI). Frontend-only; deploy with the site.
**Verify:** a non-admin session is redirected off both pages.

---

## Self-review
- Coverage: R1-R5 flip all 35 vulnerable views; R1 closes the privilege-escalation P0 (view flip + admin policy + column-guard trigger together); R3/R4 enable RLS on 3 exposed disabled tables with covering policies; R6 the 4th disabled table; R7 the UI-gating gap. Matches map §6 order exactly.
- Each atomic task ships policy/trigger WITH the flip — no silent-break window.
- Ordering: highest-value/highest-risk first (R1), proven before the low-risk batch (R5).
