# Partner Marketplace — Progress

## Chunk 1 (tenancy + verification) — ✅ COMPLETE + DEPLOYED 2026-09-05

Plan: `docs/superpowers/plans/2026-09-03-partner-marketplace-chunk-1-tenancy.md` (15 tasks).
Branch `design/partner-marketplace` (33 commits) → merged into `main` (merge commit `eaa7039`), pushed to origin, deployed to production.

**Shipped:** agency entity + tenancy (schema v30–v38), self-serve `mp-agency-register`, admin `mp-agency-verify`, team invites `mp-agency-invite`/`-accept`, partnership profile/onboarding, `partners-signup/onboarding/dashboard.html`, admin Agencies page `admin-mp-agencies.html`, `js/mp-core.js` + `mp-*.js`. AI wrapper `_shared/mp-ai.ts` + `mp_ai_runs` telemetry (skeleton, later chunks use it).

**Acceptance (all green):**
- RLS isolation gate `tests/rls/mp-isolation.sql` — **12/12 PASS** on production (incl. `token_column_denied` — the invite-token grant leak fix `0586108` verified live).
- Playwright `tests/partners.spec.js` — **5/5 pass** (incl. the two regression tests added with the final review fixes: invite-failure stays put; invite token survives a signed-out login redirect).
- Final whole-branch review findings (1 critical + 3 important) all fixed & committed before merge: `0586108` (column-scope invite SELECT grant), `8294f86` (storage policy text-compare hardening + DELETE policy), `a777817` (callVerify cold-start), `910ced2` (invite token across login redirect).

**Post-deploy smoke (production, 2026-09-05):** register throwaway agency via live `mp-agency-register` → `pending_verification` row + owner membership confirmed → admin verify via live `mp-agency-verify` (as `e2e-admin@globalhire-test.com`) → `status=verified` confirmed on DB → throwaway deleted (auth user + agency + membership, 0 leftovers). New pages 200 on `https://globalhire.elabsolution.org/partners-signup|partners-onboarding|partners-dashboard|admin-mp-agencies`.

**Edge functions live:** `mp-agency-register`, `mp-agency-verify`, `mp-agency-invite`, `mp-agency-invite-accept` (deployed/redeployed on `evzhnsugmvtqgmvzwyix`, in sync).

**Not in this chunk (deferred to later chunk plans):** jobs, candidates, nominations, claims, matching, screening, comms, pipeline, ledger, messaging (spec §12 chunks 2–11).

## S10 (partner messaging) — ✅ COMPLETE + DEPLOYED 2026-09-13

Plan: `.superpowers/sdd/2026-09-12-partner-messaging/` (15 tasks). Branch `feat/partner-messaging`.

**Shipped:** `mp_threads`/`mp_messages`/`mp_notifications` (schema v40), unread-counter
trigger + `mp_mark_thread_read`/`mp_create_thread_with_message`/`mp_append_message` RPCs
(v40b), edge fns `mp-thread-create`/`mp-thread-post`/`mp-thread-attachment`/`mp-notify`,
partner surface `partners-messages.html` + `js/mp-messages.js`/`mp-messages-partner.js`,
admin surfaces `admin-mp-messages.html` + Messages tab on `admin-mp-agencies.html` +
`js/mp-messages-admin.js`, unread bell `js/mp-bell.js`, `mp-agency-verify` notification
wiring + onboarding "Open Messages" CTA (Task 14).

**Acceptance (all green):**
- RLS isolation gate `tests/rls/mp-messaging-isolation.sql` — **6/6 PASS**.
- RLS isolation gate `tests/rls/mp-isolation.sql` (Chunk 1 gate) — **12/12 PASS**, no regression.
- Backend round trip against LIVE edge functions (throwaway agency + throwaway admin,
  both fully deleted after — 0 leftovers across 10 tables/stores): register → admin
  creates thread via `mp-thread-create` → agency uploads a real PDF to storage →
  agency replies with the attachment via `mp-thread-post` → `gh_unread` incremented →
  attachment signed URL fetched as both the agency member and (the actual point of
  the function) as admin, bytes verified identical to the upload.
- Production leak grep on `mp_messages.body_md`/`attachments` — **0 rows**.
- Playwright: 5 pre-existing tests still pass; new admin/agency round-trip test
  added with a `signInAs()` helper and a real `tests/fixtures/licence.pdf`, gated
  behind `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`/`E2E_AGENCY_EMAIL`/`E2E_AGENCY_PASSWORD`
  — **skips cleanly** (none of the four are set in this environment) rather than
  failing or fabricating a pass.

**P0 found and fixed during Task 15's round trip:** `mp_create_thread_with_message`
and `mp_append_message` (v40b) `REVOKE ALL ... FROM public, anon, authenticated`
also stripped the implicit PUBLIC execute grant `service_role` depended on, with no
explicit `GRANT ... TO service_role` ever added — so **both functions were
uncallable by anyone in production from the moment they were deployed (Tasks 4/6)
until this fix**, confirmed live via `SET ROLE service_role`. Fixed additively in
`schema-v40c-mp-messaging-grants-fix.sql` (grants EXECUTE to `service_role` only —
the "service-role only" design is unchanged). Both RLS gates re-run and unchanged
after the fix.

**Known deferral, unaffected by this chunk being complete:** Task 8 (the `pg_net`
notification-on-message trigger) is deferred and NOT applied — posting a message
produces no `mp_notifications` row and no email. `mp-agency-verify` remains the only
writer to `mp_notifications` (Task 14). The admin drawer's send-confirmation copy
("...the agency is emailed...") is therefore inaccurate until Task 8 ships; flagged,
not fixed, in `.superpowers/sdd/2026-09-12-partner-messaging/task-15-report.md`
(out of Task 15's file scope).

See `.superpowers/sdd/2026-09-12-partner-messaging/task-15-report.md` for full literal command output.
