# Partner Marketplace — Messaging & Notifications (S10) — Design Spec

Date: 2026-09-12
Status: Draft for CEO review (approved through brainstorming; not yet planned)
Repo: `GLOBALHIRE@ELAB` · GlobalHire Supabase `evzhnsugmvtqgmvzwyix` (`globalhire` schema + `gh_*` public views)
Implements: §5.10 and §8.3 of `docs/superpowers/specs/2026-09-03-globalhire-partner-marketplace-design.md`
Builds on: Chunk 1 (tenancy + verification), LIVE 2026-09-05 — `docs/superpowers/plans/partner-marketplace-progress.md`

---

## 1. Purpose

Chunk 1 gave GlobalHire an agency verification queue with exactly three outcomes: **Verify**, **Reject**,
**Suspend**. There is no way to say *"before I approve you, send me your trade licence."* The
`verification_note` column exists and is already emailed, but it is chained to reject and suspend — the two
actions that end an application. The `pending_verification` banner the agency sees is a hardcoded string
that ignores the note entirely.

The result is that the only way to ask an agency for anything is to reject them, or to leave the system and
send a personal email that nothing records.

This spec builds the marketplace's messaging layer — a two-way, attachment-carrying, auditable thread
between GlobalHire staff and partner agencies — as designed in §5.10/§8.3 of the master spec.

### Scope decision (CEO, 2026-09-12)

The master spec's S10 is written around nominations and jobs: threads auto-open per nomination, and the
notification fan-out fires on interview/offer/statement events. **Chunks 2–9 do not exist.** The CEO chose
to build S10 in full rather than an agency-only slice.

That is buildable with one honest limit: **a trigger needs a table to sit on.** So this spec delivers every
S10 *component* — all three tables with the complete schema, both inboxes, the bell, the fan-out function —
and wires every emitter whose event source exists today. Notification types belonging to unbuilt chunks are
defined in the CHECK constraint but have no emitter until their chunk lands. Nothing about their arrival
requires a migration.

| S10 component | This spec |
|---|---|
| `mp_threads`, `mp_messages`, `mp_notifications` | Built, full spec schema, all four `context_type` values |
| Partner inbox | Built — `partners-messages.html` |
| Admin inbox | Built — `admin-mp-messages.html` + Messages tab in the `admin-mp-agencies` drawer |
| Unread counts, both sides | Built, trigger-maintained |
| Bell | Built, both sides |
| `mp-notify` fan-out | Built |
| Attachments | Built |
| Emitters: `new_message`, `agency_verified/rejected/suspended` | Wired |
| Emitters: nomination / interview / offer / statement / match / dedupe | Type defined, **inert** — no source table exists |

---

## 2. Data model — `schema-v40-mp-messaging.sql`

> `schema-v39` is taken (`schema-v39-apply-entry-stage.sql`). This migration is **v40**.

### `globalhire.mp_threads`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `agency_id` | uuid not null | → `mp_agencies(id)` on delete cascade |
| `subject` | text not null | |
| `context_type` | text not null | CHECK in (`nomination`,`job`,`agency`,`general`) |
| `context_id` | uuid null | null for `agency`/`general` |
| `last_message_at` | timestamptz not null default now() | list ordering |
| `gh_unread` | int not null default 0 | unread **for GlobalHire staff** |
| `agency_unread` | int not null default 0 | unread **for the agency** |
| `created_by` | uuid not null | |
| `created_at` | timestamptz not null default now() | |

Index: `(agency_id, last_message_at desc)`; partial index on `gh_unread > 0` for the admin queue.

### `globalhire.mp_messages`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `thread_id` | uuid not null | → `mp_threads(id)` on delete cascade |
| `sender_user_id` | uuid not null | |
| `sender_side` | text not null | CHECK in (`agency`,`gh`) — **derived server-side**, never client-supplied |
| `body_md` | text not null | |
| `ai_assisted` | bool not null default false | reserved for the S7 drafting feature |
| `attachments` | jsonb not null default `'[]'` | `[{path, name, size, mime}]` — storage paths, never URLs |
| `created_at` | timestamptz not null default now() | |

Index: `(thread_id, created_at)`.

### `globalhire.mp_notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | recipient |
| `agency_id` | uuid null | null for GH-staff notifications |
| `type` | text not null | CHECK — full set below |
| `title`, `body`, `link` | text | `link` is a relative app path |
| `read_at` | timestamptz null | |
| `email_sent` | bool not null default false | |
| `created_at` | timestamptz not null default now() | |

Index: `(user_id, read_at, created_at desc)`.

**Notification type set** (complete from the master spec; emitters marked):

`new_message` ✅ · `agency_verified` ✅ · `agency_rejected` ✅ · `agency_suspended` ✅ ·
`new_job_match` ⏳ · `nomination_status` ⏳ · `dedupe_block` ⏳ · `interview_proposed` ⏳ ·
`interview_confirmed` ⏳ · `offer_extended` ⏳ · `statement_issued` ⏳ · `statement_paid` ⏳

✅ = wired in this spec. ⏳ = defined, inert until its chunk exists.

### Triggers

- `mp_messages_after_insert` — bumps `last_message_at`, increments the **opposite** side's unread counter,
  and calls `pg_net` → `mp-notify`. Unread counts are never computed client-side.
- `mp_mark_thread_read(p_thread_id uuid, p_side text)` — SECURITY DEFINER RPC, zeroes the caller's side
  only after re-deriving that side server-side from `is_admin()`. An agency member cannot clear the GH
  counter.

---

## 3. Tenancy and RLS

Identical predicate to every other `mp_*` table:

```
agency_id IN (SELECT globalhire.my_agency_ids()) OR globalhire.is_admin()
```

- `mp_threads` — SELECT by that predicate. No client INSERT/UPDATE/DELETE.
- `mp_messages` — SELECT where the parent thread passes the predicate. No client writes.
- `mp_notifications` — SELECT/UPDATE where `user_id = auth.uid()` (UPDATE limited to `read_at` by a
  column guard trigger, matching the `mp_agencies` guard pattern).

**Access level:** all **active** agency members read and post. This is deliberate and consistent —
`my_agency_ids()` already gates on `status = 'active'`, so a removed or merely invited member sees nothing.

**Grants**, following the v35 discipline (Supabase's default privileges must be explicitly revoked):

```
REVOKE ALL ON <each table> FROM anon, authenticated;
GRANT SELECT              ON mp_threads, mp_messages TO authenticated;
GRANT SELECT, UPDATE      ON mp_notifications        TO authenticated;
```

Public `security_invoker` wrapper views `gh_mp_threads` / `gh_mp_messages` / `gh_mp_notifications` mirror
the same grants, per the established pattern.

**`sender_side` forgery is structurally impossible:** there is no client write path. Every message is
posted through `mp-thread-post`, which derives the side from `is_admin()` on the verified JWT.

---

## 4. Attachments

Files are stored at:

```
marketplace/agency/<agency_id>/thread/<message_id>/<filename>
```

**Agency uploads need no storage-policy change.** The v38 policies match on path segments 1–3
(`marketplace` / `agency` / `<agency_id>`) and do not constrain segment 4, so `thread/` is already covered
for active members.

**Admins are the exception, and it is load-bearing.** An admin is not an agency member, so
`my_agency_ids()` excludes them and storage RLS denies the read. Widening those policies is the wrong fix:
`gh-applicant-documents` is a **shared** bucket that also holds `recruiter-clients/…` and applicant paths,
and v38 exists precisely because a careless predicate there broke unrelated flows for every authenticated
user.

So attachments are served through a service-role edge function, `mp-thread-attachment`, which authorises
*"active member of this agency **or** admin"* and then mints a short-lived signed URL. Storage RLS is not
touched. `attachments` stores **paths, never URLs** — a persisted signed URL is a leak with an expiry date.

Upload limits inherit the bucket: 10 MB, `application/pdf | image/jpeg | image/png | image/webp`. The
client validates before upload so the failure is a readable message rather than a storage error.

---

## 5. Surfaces

### Partner — `partners-messages.html`

Thread list (subject, last message, unread badge) → thread view (chronological, sender-attributed) →
compose with attach. Follows the `partners-dashboard` shell and the `MP.*` contract in `js/mp-core.js`
(`MP.init()` exactly once per load; `MP.status === 'error'` renders in-page, never redirects).

Available at **any** agency status. An agency that is `pending_verification` must be able to answer the
question that is blocking its own verification — gating messaging on being verified would reintroduce the
exact deadlock this spec removes.

### Admin — `admin-mp-messages.html` + drawer tab

The master spec folds the admin inbox into `admin-mp-nominations.html`, which does not exist. Instead:

1. **`admin-mp-messages.html`** — standalone cross-agency inbox, default-filtered to threads with
   `gh_unread > 0`, in the admin console sidebar beside *Partner Agencies*.
2. **A Messages tab in the existing review drawer** on `admin-mp-agencies.html` — the thread for the agency
   currently under review, where the decision to ask for a document is actually made.

Both write through the same `mp-thread-post`.

### Bell

Unread count from `mp_notifications where read_at is null`, in the partner shell header and the admin
console header. Click → notification list → `link` navigates to the thread.

---

## 6. Edge functions

| Function | Auth | Does |
|---|---|---|
| `mp-thread-create` | JWT; member or admin | Creates a thread (`context_type`, `context_id`, subject) + its first message. Both rows are written by one SECURITY DEFINER RPC, `mp_create_thread_with_message`, so a failed first message cannot leave an empty thread stranded in either inbox |
| `mp-thread-post` | JWT; member or admin | Appends a message; derives `sender_side`; validates attachment paths are inside this agency's prefix |
| `mp-thread-attachment` | JWT; member or admin | Authorises, then mints a short-lived signed URL |
| `mp-notify` | internal only | Fan-out: writes `mp_notifications` rows + sends email |

`mp-notify` clones the hardened `notify-interest` pattern: `x-internal-secret` header, **recipients
resolved server-side from `thread_id`**, never read from the request payload. It reuses
`_shared/gh-email-shell.ts` for branding.

All four honour the `{ok, status, data}` never-rejects contract from `js/mp-core.js`, including on
cold-start non-JSON bodies — the failure mode fixed in Chunk 1 commit `a777817`.

---

## 7. Error handling

- **Email failure is non-fatal and logged**, matching `mp-agency-verify`. A dead SMTP must never roll back
  a posted message. `email_sent` records the truth rather than assuming success.
- **`pg_net` is fire-and-forget.** A message is committed before the notification is dispatched; the thread
  is the source of truth, notifications are a convenience. A lost notification must never mean a lost
  message.
- **Attachment upload failure aborts the post** with a readable message, rather than posting a message that
  references a file that does not exist. (This is the inverse of the Chunk 1 onboarding bug, where an
  upstream failure silently cancelled the whole save.)

---

## 8. Migration of existing behaviour

`mp-agency-verify` keeps its three actions unchanged, and gains: on `verified`/`rejected`/`suspended` it
writes an `mp_notifications` row alongside the email it already sends.

The `pending_verification` banner in `js/mp-onboarding.js` — today a hardcoded string that discards
`verification_note` — gains an unread-messages call to action linking to `partners-messages.html`.

No existing status, action, or email changes. Nothing in Chunk 1 is rewritten.

---

## 9. Acceptance gates

Extend `tests/rls/mp-isolation.sql`:

1. Agency A cannot SELECT agency B's thread, or its messages.
2. Agency A cannot INSERT a message directly (no client write grant).
3. An agency member cannot zero `gh_unread` via `mp_mark_thread_read`.
4. A non-member, non-admin cannot obtain a signed URL from `mp-thread-attachment`.
5. An admin **can** read an agency's attachment.
6. `anon` has nothing on any of the three tables.

Playwright (`tests/partners.spec.js`): admin asks for a document from the drawer → agency sees bell +
banner → agency replies with a file → admin opens it. Plus `_test.ts` unit files for each edge function,
matching the Chunk 1 convention.

**Production smoke** before sign-off, mirroring Chunk 1's: throwaway agency, full round trip, then delete
with zero leftovers. Per the repo's standing rule, `grep` production for home-directory paths and
provenance leaks in message bodies and `attachments` after the first real sync.

---

## 10. Scale

1 migration · 4 edge functions · 2 RPCs (`mp_mark_thread_read`, `mp_create_thread_with_message`) ·
2 triggers (message after-insert; notifications column guard).

New pages: `partners-messages.html`, `admin-mp-messages.html`.

Modified: `admin-mp-agencies.html` (drawer Messages tab) · `js/mp-onboarding.js` (pending banner call to
action) · the admin console sidebar (nav item — a shared block repeated across the admin pages) · the
partner shell header and admin console header (bell) · `supabase/functions/mp-agency-verify/index.ts`
(write an `mp_notifications` row alongside the existing email).

Materially larger than Chunk 1's verification slice. Chunk 10 in the master spec's build sequence, being
built out of order at CEO direction because the verification loop is unusable without it.

---

## 11. Deliberately excluded

- **No realtime.** Polling on page load and on send. Supabase Realtime is a later optimisation; it is not
  needed at this volume and adds a connection-lifecycle failure mode.
- **No message editing or deletion.** The thread is an audit record of what was asked and answered.
- **No AI drafting.** `ai_assisted` exists on the row for S7 to set later; nothing writes it here.
- **No digest email.** One email per message. Volume is a handful of agencies; batching is premature.
- **No candidate-facing threads.** Agency ↔ GlobalHire only.
