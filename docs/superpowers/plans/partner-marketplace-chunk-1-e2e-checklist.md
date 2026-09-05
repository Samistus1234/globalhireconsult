# Partner Marketplace — Chunk 1 manual E2E checklist

Chunk 1 (tenancy + verification) shipped with an automated gate — `tests/rls/mp-isolation.sql`
(cross-agency RLS/grant isolation), 10 Deno unit tests (`mp-agency-register`/`mp-agency-invite`/
`mp-agency-verify`/`_shared/mp-ai.ts`), `node --check` on all 5 `js/mp-*.js` files, and 4
Playwright page-smoke specs (`tests/partners.spec.js`) — but none of that automation drives a
real browser through the full signup → verify → onboard → invite → accept → suspend journey
against production. Run this checklist by hand against
`https://globalhire.elabsolution.org` before treating Chunk 1 as fully proven end-to-end.

Use a throwaway agency (email pattern `mp-e2e-<date>@example.com` or similar, never a real
recruiter) and delete it via `auth.admin.deleteUser` (cascades to the agency + membership rows)
as the last step.

## What automation could NOT cover this chunk (read this first)

1. **The admin happy path** — verify / reject / suspend through a *real* admin session was
   never exercised end-to-end. Minting an admin user on production was out of scope for this
   chunk's automation, so `mp-agency-verify`'s authz branch, the `admin-mp-agencies.html`
   review-drawer UI, and the resulting owner notification email have only been unit-tested
   (`validateVerifyBody`) and curl-smoked with a hand-obtained admin JWT — never clicked
   through as an admin in a browser.
2. **The onboarding page's runtime behaviour** — `tests/partners.spec.js`'s
   `partners-onboarding` specs run with **JavaScript disabled** (DOM-shape smoke only: the
   form renders with the right checkbox groups, the invite-failure regression check confirms
   `requireAgency` isn't called). That means invite-token handling, the `MP.requireAgency`
   redirect/guard logic, the licence/company-profile upload path construction
   (`marketplace/agency/<agency_id>/...`), and the team-list/invite-form gating by membership
   role have **only ever run under a real browser in this manual checklist** — never under
   Playwright with JS enabled.

Both gaps are why every step below must be run by a human in a real browser at least once
before Chunk 2 builds on this tenancy layer.

## Checklist

### 1. Sign up a new agency
- [ ] Open `https://globalhire.elabsolution.org/partners-signup.html`.
- [ ] Fill full name, a throwaway email (`mp-e2e-<yourinitials>-<date>@example.com`), an
      8+ character password, and an agency name. Submit.
- [ ] Confirm the success message ("Registration received. An admin will verify your agency.")
      — no console errors.
- [ ] Confirm the "registration received" email arrives at the throwaway inbox.
- [ ] In the DB, confirm one `globalhire.mp_agencies` row (`status='pending_verification'`)
      and one `globalhire.mp_agency_members` row (`role='owner'`, `status='active'`) exist for
      the new user.
- [ ] Attempt to log in immediately — confirm you're blocked/unconfirmed (the account's email
      isn't confirmed until an admin verifies).

### 2. Admin verifies the agency
- [ ] Log in to `recruiters.html` as a real platform admin.
- [ ] Open **Partner Agencies** (`admin-mp-agencies.html`) from the sidebar.
- [ ] Confirm the new agency appears in the default (pending) filter view.
- [ ] Open its review drawer — confirm agency name, owner name, country/city (if given) all
      match what was submitted.
- [ ] Click **Verify**. Confirm the row moves out of the pending filter and the drawer/list
      reflect `status='verified'`.
- [ ] Confirm the owner receives the "your agency is verified" email with a link to
      `partners-dashboard.html`.
- [ ] In the DB, confirm `verified_by` = the admin's user id and `verified_at` is set.

### 3. Owner logs in and completes the partnership profile
- [ ] Log in as the agency owner (email now confirmed by step 2's `email_confirm: true`).
- [ ] Land on `partners-dashboard.html` — confirm the status banner reads "verified" and links
      into onboarding/profile completion.
- [ ] Open `partners-onboarding.html`. Confirm the profile form pre-fills the agency name and
      is otherwise editable at any status.
- [ ] Fill in country, city, address, website, year founded, owner name, at least one service
      and one cooperation area.
- [ ] Upload a licence file (PDF or image) via the "Trade / recruitment licence" file input.
- [ ] Submit. Confirm the success message, and that a re-load of the page shows the saved
      values (proves the `MP.mpFrom('agencies').update(...)` write path — the one live write
      path this chunk's grant-tightening (schema-v35) deliberately preserved).
- [ ] In storage, confirm the uploaded licence object lives under
      `gh-applicant-documents/marketplace/agency/<agency_id>/...` and is **not** readable by a
      second, unrelated agency owner account (spot-check via that account's session — should
      404/403).

### 4. Owner invites a teammate
- [ ] Still on `partners-onboarding.html`, confirm the **Team** section is visible now that
      the caller is an active member.
- [ ] Enter a second throwaway email in "Invite by email", pick a role (admin or member),
      submit.
- [ ] Confirm the success message and that the new row appears in the team list as "invited"/
      pending.
- [ ] Confirm the invite email arrives with a link of the form
      `partners-onboarding.html?invite=<token>`.
- [ ] In the DB, confirm one `globalhire.mp_agency_invites` row (`status='pending'`,
      `expires_at` ~14 days out).

### 5. Teammate accepts the invite
- [ ] In a separate browser/session, sign up or log in as the invited email.
- [ ] Open the invite link from the email.
- [ ] Confirm the page calls `mp-agency-invite-accept` and reports success — no silent
      `{success:true}` on a failed write (this chunk's hardening, A3, made the membership
      upsert failure-path return a real error instead).
- [ ] Confirm the teammate now sees the agency's data on `partners-dashboard.html` /
      `partners-onboarding.html` (team list, profile) matching the owner's view.
- [ ] In the DB, confirm the invite flipped to `status='accepted'` with `accepted_user_id` set,
      and a matching `mp_agency_members` row (`status='active'`, correct role) exists.
- [ ] **Negative check** — using a third throwaway account (different email than the invite),
      try opening the same invite link. Confirm it's rejected ("this invite was issued to a
      different email") and no membership is created for that account.

### 6. Suspend from the admin page
- [ ] Back in `admin-mp-agencies.html` as admin, find the test agency (filter dropdown →
      "Suspended" won't show it yet — use the default/all view or search).
- [ ] Open its drawer, click **Suspend**, optionally with a note.
- [ ] Confirm the owner receives the "agency suspended" email (with the note, if given).
- [ ] Confirm the owner's next login/dashboard visit reflects `status='suspended'` (banner
      copy, restricted actions).
- [ ] In the DB, confirm `status='suspended'`, `verification_note` set if a note was given.

### 7. Clean up
- [ ] Delete every throwaway user created in this run via `auth.admin.deleteUser` (cascades to
      `mp_agencies`/`mp_agency_members`/`mp_agency_invites` rows and any uploaded storage
      objects should be removed manually if the cascade doesn't cover storage).
- [ ] Re-run the Part C baseline query — confirm it's back to the pre-checklist agency/owner/
      invite counts and `0` users matching the throwaway email pattern.
