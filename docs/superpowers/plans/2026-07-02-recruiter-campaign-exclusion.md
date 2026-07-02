# Per-Recruiter Campaign Exclusion — Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let GlobalHire admins opt a recruiter out of direct marketing so that recruiter's candidates are excluded from Command Centre email/WhatsApp campaigns. Default = included; flip a recruiter OFF to exclude. First opt-out: **GATA ROYAL**.

**Architecture:** Cross-system. The opt-out toggle lives on GlobalHire (`globalhire.profiles.allow_direct_marketing`). Campaigns are sent from the Command Centre (Supabase `fwmhfwprvqaovidykaqt`) via the `elab-ops-monitor` MCP. Enforcement = a new `do_not_market` flag on Command Centre `email_contacts`, honored by the MCP audience builder. A **suppression bridge** (email-match) sets that flag for opt-out recruiters' candidate emails, because the two databases share no recruiter key.

**Tech stack:** Postgres RLS/migrations (both DBs, via Supabase MCP `apply_migration`), the `elab-ops-monitor` TypeScript MCP (`src/email-campaigns.ts`, `src/index.ts`; build → `build/`, vitest tests, `deploy.sh` to VPS), GlobalHire vanilla-JS admin, an edge function for the bridge.

## Global Constraints
- Command Centre project: `fwmhfwprvqaovidykaqt`. GlobalHire project: `evzhnsugmvtqgmvzwyix`.
- MCP suppression must be applied at EVERY send path: `isMailableRecipient` (the single audience gate, `src/email-campaigns.ts:~70`), `resolveAudience`/`finalizeAudience`, `bulkBroadcast` (`src/index.ts:5101`), and `send_marketing_email`.
- MCP deploy gotcha (memory): build emits runtime files to `build/`; ALL must ship; deploy via `deploy.sh` / GitHub Gist to the VPS. Rebuild (`npm run build`) + run vitest before deploy.
- Default `do_not_market = false` (include). Exclusion is opt-out per recruiter.
- Cross-DB link is by normalized (lowercased, trimmed) email. There is no shared recruiter id.

---

### Task 1: GlobalHire — `allow_direct_marketing` toggle on recruiters + set GATA ROYAL off

**Files:**
- Create: `schema-v19-recruiter-marketing-optout.sql`
- Modify: `recruiters.html` (toggle column/control), `js/recruiters-admin.js` (render + update)

**Interfaces:**
- Produces: `globalhire.profiles.allow_direct_marketing boolean not null default true`; surfaced through the existing `public.gh_profiles` view automatically (it is `SELECT *`). Admin reads/writes via `ghFrom('profiles')`.

- [ ] **Step 1:** Migration: `ALTER TABLE globalhire.profiles ADD COLUMN allow_direct_marketing boolean NOT NULL DEFAULT true;` Apply via `apply_migration(project_id='evzhnsugmvtqgmvzwyix', name='v19_recruiter_marketing_optout', query=...)`.
- [ ] **Step 2:** Verify `select id, full_name, allow_direct_marketing from public.gh_profiles where role='recruiter';` returns the column (all true).
- [ ] **Step 3:** In `js/recruiters-admin.js` row render (near the approve/status cell ~line 74), add a **"Direct marketing"** toggle (On/Off) bound to `r.allow_direct_marketing`.
- [ ] **Step 4:** Handler: on toggle, `await ghFrom('profiles').update({ allow_direct_marketing: newVal }).eq('id', r.id);` then refresh row. Confirm dialog when turning OFF ("Exclude {name}'s candidates from all marketing campaigns?").
- [ ] **Step 5:** Set GATA ROYAL off now: `update globalhire.profiles set allow_direct_marketing=false where full_name ilike '%NIKE ADEJUMOBI MURTALA%' and role='recruiter';` (confirm exactly one row first).
- [ ] **Step 6:** Verify in UI the toggle shows Off for GATA ROYAL.
- [ ] **Step 7: Commit** `git add schema-v19-recruiter-marketing-optout.sql recruiters.html js/recruiters-admin.js && git commit -m "feat(recruiter): allow_direct_marketing opt-out toggle"`.

---

### Task 2: Command Centre — `do_not_market` flag on `email_contacts`

**Files:**
- Migration applied via Supabase MCP to `fwmhfwprvqaovidykaqt` (record it in `/Users/samuel/elab-ops-monitor/migrations/`)

**Interfaces:**
- Produces: `public.email_contacts.do_not_market boolean not null default false`, `email_contacts.marketing_optout_reason text`, index on `(org_id, do_not_market)`.

- [ ] **Step 1:** `apply_migration(project_id='fwmhfwprvqaovidykaqt', name='email_contacts_do_not_market', query='ALTER TABLE public.email_contacts ADD COLUMN do_not_market boolean NOT NULL DEFAULT false, ADD COLUMN marketing_optout_reason text; CREATE INDEX IF NOT EXISTS idx_email_contacts_do_not_market ON public.email_contacts(org_id, do_not_market);')`.
- [ ] **Step 2:** Save the SQL to `/Users/samuel/elab-ops-monitor/migrations/NNNN_email_contacts_do_not_market.sql`.
- [ ] **Step 3:** Verify `select count(*) from email_contacts where do_not_market;` → 0.
- [ ] **Step 4: Commit** in the elab-ops-monitor repo.

---

### Task 3: Command Centre MCP — honor `do_not_market` in every send path

**Files:**
- Modify: `/Users/samuel/elab-ops-monitor/src/email-campaigns.ts` (`isMailableRecipient`, `resolveAudience` contact fetch, `finalizeAudience`)
- Modify: `/Users/samuel/elab-ops-monitor/src/index.ts` (`bulkBroadcast` ~5101; `send_marketing_email`)
- Modify: `/Users/samuel/elab-ops-monitor/tests/email-campaigns.test.ts`

**Interfaces:**
- Consumes: `email_contacts.do_not_market` (Task 2).
- Produces: any recipient whose contact has `do_not_market=true` is excluded from audience counts and sends, reported as `suppressedSkipped`.

- [ ] **Step 1: Write failing test** in `tests/email-campaigns.test.ts`: given an `email_contacts` row with `do_not_market=true`, `isMailableRecipient` returns `{ ok:false, reason:'do_not_market' }`, and `resolveAudience`/finalize exclude it (increment `suppressedSkipped`).
- [ ] **Step 2: Run** `npx vitest run tests/email-campaigns.test.ts` → FAIL.
- [ ] **Step 3: Implement.** In `isMailableRecipient(c)` add, alongside the `status==='unsubscribed'` check: `if (c.do_not_market) return { ok:false, reason:'do_not_market' };`. Ensure every query that selects contacts also selects `do_not_market` (the contact-existence fetch in `finalizeAudience` `select('id,email,status')` → add `,do_not_market`; and any `email_contacts` select in `resolveAudience`/stats used for gating).
- [ ] **Step 4:** In `src/index.ts` `bulkBroadcast` and `send_marketing_email`, when resolving recipients from `email_contacts`, filter `do_not_market=false` (add `.eq('do_not_market', false)` to the contact query, or reuse `isMailableRecipient`). Report skipped count.
- [ ] **Step 5: Run** vitest → PASS. Run full suite `npx vitest run`.
- [ ] **Step 6: Build + deploy** `npm run build` (verify `build/email-campaigns.js` + `build/index.js` updated), then `./deploy.sh` (ship ALL emitted runtime files to VPS per deploy gotcha). Restart MCP.
- [ ] **Step 7: Verify live** via MCP `email_audience_preview` with a raw_emails list containing one flagged email → preview count excludes it and reports it skipped.
- [ ] **Step 8: Commit** in elab-ops-monitor.

---

### Task 4: Suppression bridge — flag opt-out recruiters' candidate emails in the Command Centre

**Files:**
- Create: `/Users/samuel/GLOBALHIRE@ELAB/supabase/functions/sync-marketing-suppression/index.ts` (edge function, GlobalHire) OR a documented admin action calling it.

**Interfaces:**
- Consumes: GlobalHire opt-out recruiters (`allow_direct_marketing=false`) and their candidate emails — from `globalhire.recruiter_clients.email` (Plan 1) and assigned `globalhire.profiles` where `recruiter_id` in opt-out set; the Command Centre `email_contacts` (service-role).
- Produces: sets `email_contacts.do_not_market=true, marketing_optout_reason='recruiter_optout:{recruiter}'` for matching emails (normalized). Idempotent.

- [ ] **Step 1:** Gather opt-out emails: query GlobalHire for recruiters with `allow_direct_marketing=false`; collect their candidates' emails (recruiter_clients + assigned profiles), lowercased/trimmed, deduped.
- [ ] **Step 2:** Against the Command Centre (service-role client, project `fwmhfwprvqaovidykaqt`): `update email_contacts set do_not_market=true, marketing_optout_reason='recruiter_optout' where lower(email) in (<emails>) and org_id=<org>;` Also set any matching `persons` marker if desired (optional).
- [ ] **Step 3:** Re-include path: when a recruiter is toggled back ON, clear `do_not_market` for their emails that have `marketing_optout_reason='recruiter_optout'` (don't clear genuine unsubscribes).
- [ ] **Step 4:** Trigger: invoke from the Task 1 admin toggle handler (fire-and-forget) AND expose a manual "Sync suppression" admin button. (No cross-DB FK possible; email-match sync is the bridge.)
- [ ] **Step 5:** Run once for GATA ROYAL; verify affected `email_contacts` now have `do_not_market=true`.
- [ ] **Step 6: Commit + deploy** the edge function (`supabase functions deploy sync-marketing-suppression`).

---

### Task 5: End-to-end verification

- [ ] **Step 1:** Pick a GATA ROYAL candidate email known to be in `email_contacts`. Confirm `do_not_market=true` (Task 4).
- [ ] **Step 2:** `email_audience_preview` (or a draft `email_campaign_create`) over an audience that would include that email → it is **excluded** and counted as skipped.
- [ ] **Step 3:** `bulk_broadcast` dry-run over a stage containing that contact → excluded.
- [ ] **Step 4:** Toggle GATA ROYAL back ON, re-sync → the email becomes mailable again (unless separately unsubscribed).
- [ ] **Step 5:** Document the behavior in the design spec's "resolved" section.

---

## Self-Review
- **Spec coverage:** opt-out toggle (T1), CC enforcement flag (T2), audience-builder honoring it across all send paths incl. WhatsApp `bulk_broadcast` (T3), cross-DB bridge by email (T4), verification incl. re-include (T5). GATA ROYAL flipped off (T1 S5, T4 S5).
- **Cross-system honesty:** enforcement is by email-match, not a shared key — documented as the deliberate bridge. New CC contacts added mid-campaign default to mailable; the toggle handler + manual sync (T4) close the gap; note residual race in T4.
- **Deploy dependency:** T3 requires MCP rebuild + VPS deploy (deploy.sh), separate from the website — called out in Global Constraints.
- **Placeholder scan:** none — each step has concrete SQL/paths/commands.
