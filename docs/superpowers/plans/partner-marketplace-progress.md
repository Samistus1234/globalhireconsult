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
