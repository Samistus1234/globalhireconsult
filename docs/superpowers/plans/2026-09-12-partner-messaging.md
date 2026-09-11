# Partner Marketplace Messaging & Notifications (S10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give GlobalHire staff and partner agencies a two-way, attachment-carrying, auditable message thread, so an agency can be asked for a document without being rejected.

**Architecture:** Three new tables (`mp_threads`, `mp_messages`, `mp_notifications`) in the `globalhire` schema behind `gh_mp_*` `security_invoker` views, with the same `my_agency_ids() OR is_admin()` tenancy predicate every other `mp_*` table uses. `authenticated` gets SELECT only — every write goes through an edge function so `sender_side` is derived server-side and can never be forged. A message-insert trigger maintains per-side unread counts and fires `pg_net` → `mp-notify` for email + in-app notification rows. Attachments live under the existing `marketplace/agency/<id>/` storage prefix and are served by a service-role function that authorises member-or-admin, so storage RLS on the shared `gh-applicant-documents` bucket is never widened.

**Tech Stack:** Postgres 15 / Supabase (`evzhnsugmvtqgmvzwyix`) · Deno edge functions · `pg_net` · nodemailer over Gmail SMTP · vanilla ES5-style browser JS (no framework, no bundler) · Playwright.

**Spec:** `docs/superpowers/specs/2026-09-12-partner-messaging-design.md`

## Global Constraints

- **Migration file is `schema-v40-mp-messaging.sql`.** `schema-v39-apply-entry-stage.sql` is taken. The second migration in this plan is `schema-v41-mp-notify-trigger.sql`.
- **Apply migrations with `supabase db query --linked -f <file>`.** NEVER `supabase db push` — remote migration history for this project is empty and `db push` will attempt to replay everything.
- **Deploy functions separately:** `supabase functions deploy <name>`. A migration apply does not deploy functions.
- **Every new table gets an explicit `REVOKE ALL ... FROM anon, authenticated` before its GRANT.** Supabase stamps default privileges at table-creation time; not granting is insufficient (this is why `schema-v35` exists).
- **Tenancy predicate, verbatim, on every new table:** `agency_id IN (SELECT globalhire.my_agency_ids()) OR globalhire.is_admin()`
- **`authenticated` grants:** `SELECT` only on `mp_threads` and `mp_messages`; `SELECT, UPDATE` on `mp_notifications`. No INSERT anywhere.
- **`sender_side` is derived server-side from `is_admin()`.** Never read it from a request body.
- **`attachments` stores storage paths, never URLs.** A persisted signed URL is a leak with an expiry date.
- **Storage RLS must not be modified.** `gh-applicant-documents` is shared with recruiter and applicant paths; `schema-v38` exists because a careless predicate there broke every authenticated user's document listing.
- **Edge functions return the never-rejects contract** `{ok, status, data}` as consumed by `MP.callFn` in `js/mp-core.js` — including on a cold-start non-JSON body (Chunk 1 commit `a777817`).
- **Email failure is non-fatal**, logged with `console.warn`, and must never roll back a committed message.
- **Checked-in SQL uses the literal placeholder `<INTERNAL_TRIGGER_SECRET>`**, substituted at apply time. Never commit the real secret.
- **Messaging is available at every agency status**, including `pending_verification`.

---

### Task 1: Migration — tables, RLS, grants, views

**Files:**
- Create: `schema-v40-mp-messaging.sql`

**Interfaces:**
- Consumes: `globalhire.my_agency_ids()`, `globalhire.is_admin()`, `globalhire.mp_agencies` (all from `schema-v30`).
- Produces: tables `globalhire.mp_threads`, `globalhire.mp_messages`, `globalhire.mp_notifications`; views `public.gh_mp_threads`, `public.gh_mp_messages`, `public.gh_mp_notifications`.

- [ ] **Step 1: Write the migration**

```sql
-- schema-v40-mp-messaging.sql
-- Partner Marketplace S10: messaging & notifications.
-- Spec: docs/superpowers/specs/2026-09-12-partner-messaging-design.md
-- NOTE: v39 is taken (schema-v39-apply-entry-stage.sql).
BEGIN;

CREATE TABLE globalhire.mp_threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL REFERENCES globalhire.mp_agencies(id) ON DELETE CASCADE,
  subject         text NOT NULL,
  context_type    text NOT NULL
                    CHECK (context_type IN ('nomination','job','agency','general')),
  context_id      uuid,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  gh_unread       int NOT NULL DEFAULT 0,
  agency_unread   int NOT NULL DEFAULT 0,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mp_threads_agency_idx ON globalhire.mp_threads (agency_id, last_message_at DESC);
CREATE INDEX mp_threads_gh_queue_idx ON globalhire.mp_threads (last_message_at DESC) WHERE gh_unread > 0;

CREATE TABLE globalhire.mp_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      uuid NOT NULL REFERENCES globalhire.mp_threads(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL,
  sender_side    text NOT NULL CHECK (sender_side IN ('agency','gh')),
  body_md        text NOT NULL,
  ai_assisted    boolean NOT NULL DEFAULT false,
  attachments    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mp_messages_thread_idx ON globalhire.mp_messages (thread_id, created_at);

CREATE TABLE globalhire.mp_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  agency_id  uuid REFERENCES globalhire.mp_agencies(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN (
               'new_message','agency_verified','agency_rejected','agency_suspended',
               'new_job_match','nomination_status','dedupe_block','interview_proposed',
               'interview_confirmed','offer_extended','statement_issued','statement_paid')),
  title      text NOT NULL,
  body       text,
  link       text,
  read_at    timestamptz,
  email_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mp_notifications_user_idx
  ON globalhire.mp_notifications (user_id, read_at, created_at DESC);

ALTER TABLE globalhire.mp_threads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.mp_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.mp_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY mp_threads_member_select ON globalhire.mp_threads
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT globalhire.my_agency_ids()) OR globalhire.is_admin());

CREATE POLICY mp_messages_member_select ON globalhire.mp_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM globalhire.mp_threads t
    WHERE t.id = mp_messages.thread_id
      AND (t.agency_id IN (SELECT globalhire.my_agency_ids()) OR globalhire.is_admin())
  ));

CREATE POLICY mp_notifications_own_select ON globalhire.mp_notifications
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY mp_notifications_own_update ON globalhire.mp_notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Column guard: a recipient may mark read, and nothing else. Mirrors mp_agencies_column_guard.
CREATE OR REPLACE FUNCTION globalhire.mp_notifications_column_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.agency_id IS DISTINCT FROM OLD.agency_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.link IS DISTINCT FROM OLD.link
     OR NEW.email_sent IS DISTINCT FROM OLD.email_sent
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'mp_notifications: only read_at may be changed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mp_notifications_column_guard_trg
  BEFORE UPDATE ON globalhire.mp_notifications
  FOR EACH ROW EXECUTE FUNCTION globalhire.mp_notifications_column_guard();

CREATE VIEW public.gh_mp_threads       WITH (security_invoker = true) AS
  SELECT * FROM globalhire.mp_threads;
CREATE VIEW public.gh_mp_messages      WITH (security_invoker = true) AS
  SELECT * FROM globalhire.mp_messages;
CREATE VIEW public.gh_mp_notifications WITH (security_invoker = true) AS
  SELECT * FROM globalhire.mp_notifications;

-- Supabase default privileges land at creation time; REVOKE is mandatory, not defensive.
REVOKE ALL ON globalhire.mp_threads       FROM anon, authenticated;
REVOKE ALL ON globalhire.mp_messages      FROM anon, authenticated;
REVOKE ALL ON globalhire.mp_notifications FROM anon, authenticated;
REVOKE ALL ON public.gh_mp_threads        FROM anon, authenticated;
REVOKE ALL ON public.gh_mp_messages       FROM anon, authenticated;
REVOKE ALL ON public.gh_mp_notifications  FROM anon, authenticated;

GRANT SELECT         ON globalhire.mp_threads       TO authenticated;
GRANT SELECT         ON globalhire.mp_messages      TO authenticated;
GRANT SELECT, UPDATE ON globalhire.mp_notifications TO authenticated;
GRANT SELECT         ON public.gh_mp_threads        TO authenticated;
GRANT SELECT         ON public.gh_mp_messages       TO authenticated;
GRANT SELECT, UPDATE ON public.gh_mp_notifications  TO authenticated;

COMMIT;
```

- [ ] **Step 2: Apply it**

Run: `supabase db query --linked -f schema-v40-mp-messaging.sql`
Expected: no error output.

- [ ] **Step 3: Verify the posture landed as intended**

Run:
```bash
supabase db query --linked "
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
from information_schema.role_table_grants
where table_name in ('mp_threads','mp_messages','mp_notifications',
                     'gh_mp_threads','gh_mp_messages','gh_mp_notifications')
  and grantee in ('anon','authenticated')
group by 1,2 order by 1,2;"
```
Expected: `anon` appears on **no** row. `authenticated` shows `SELECT` for threads/messages and `SELECT,UPDATE` for notifications — nothing else.

- [ ] **Step 4: Commit**

```bash
git add schema-v40-mp-messaging.sql
git commit -m "feat(db): mp_threads/mp_messages/mp_notifications + RLS, grants, views (S10)"
```

---

### Task 2: Unread counters and the two write RPCs

**Files:**
- Create: `schema-v40b-mp-messaging-rpcs.sql`

**Interfaces:**
- Consumes: Task 1's tables.
- Produces:
  - `globalhire.mp_mark_thread_read(p_thread_id uuid) returns void`
  - `globalhire.mp_create_thread_with_message(p_agency_id uuid, p_subject text, p_context_type text, p_context_id uuid, p_body text, p_attachments jsonb, p_sender uuid, p_side text) returns uuid`
  - `globalhire.mp_append_message(p_thread_id uuid, p_body text, p_attachments jsonb, p_sender uuid, p_side text) returns uuid`

- [ ] **Step 1: Write the migration**

```sql
-- schema-v40b-mp-messaging-rpcs.sql
-- Unread maintenance + the only write paths into mp_threads / mp_messages.
BEGIN;

-- Bump the thread and increment the OPPOSITE side's unread counter.
CREATE OR REPLACE FUNCTION globalhire.mp_messages_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE globalhire.mp_threads
     SET last_message_at = NEW.created_at,
         gh_unread     = gh_unread     + CASE WHEN NEW.sender_side = 'agency' THEN 1 ELSE 0 END,
         agency_unread = agency_unread + CASE WHEN NEW.sender_side = 'gh'     THEN 1 ELSE 0 END
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mp_messages_after_insert_trg
  AFTER INSERT ON globalhire.mp_messages
  FOR EACH ROW EXECUTE FUNCTION globalhire.mp_messages_after_insert();

-- Clear ONLY the caller's own side. The side is re-derived here; a caller cannot pass it.
CREATE OR REPLACE FUNCTION globalhire.mp_mark_thread_read(p_thread_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_is_admin boolean; v_ok boolean;
BEGIN
  v_is_admin := globalhire.is_admin();
  SELECT EXISTS (
    SELECT 1 FROM globalhire.mp_threads t
    WHERE t.id = p_thread_id
      AND (t.agency_id IN (SELECT globalhire.my_agency_ids()) OR v_is_admin)
  ) INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'mp_mark_thread_read: not your thread'; END IF;

  IF v_is_admin THEN
    UPDATE globalhire.mp_threads SET gh_unread = 0 WHERE id = p_thread_id;
  ELSE
    UPDATE globalhire.mp_threads SET agency_unread = 0 WHERE id = p_thread_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION globalhire.mp_mark_thread_read(uuid) FROM public;
GRANT EXECUTE ON FUNCTION globalhire.mp_mark_thread_read(uuid) TO authenticated;

-- Thread + first message in ONE transaction, so a failed message cannot strand an
-- empty thread at the top of both inboxes. Service-role only: no grant to authenticated.
CREATE OR REPLACE FUNCTION globalhire.mp_create_thread_with_message(
  p_agency_id uuid, p_subject text, p_context_type text, p_context_id uuid,
  p_body text, p_attachments jsonb, p_sender uuid, p_side text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_thread uuid;
BEGIN
  INSERT INTO globalhire.mp_threads (agency_id, subject, context_type, context_id, created_by)
  VALUES (p_agency_id, p_subject, p_context_type, p_context_id, p_sender)
  RETURNING id INTO v_thread;

  INSERT INTO globalhire.mp_messages (thread_id, sender_user_id, sender_side, body_md, attachments)
  VALUES (v_thread, p_sender, p_side, p_body, COALESCE(p_attachments, '[]'::jsonb));

  RETURN v_thread;
END;
$$;
REVOKE ALL ON FUNCTION globalhire.mp_create_thread_with_message(uuid,text,text,uuid,text,jsonb,uuid,text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION globalhire.mp_append_message(
  p_thread_id uuid, p_body text, p_attachments jsonb, p_sender uuid, p_side text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO globalhire.mp_messages (thread_id, sender_user_id, sender_side, body_md, attachments)
  VALUES (p_thread_id, p_sender, p_side, p_body, COALESCE(p_attachments, '[]'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION globalhire.mp_append_message(uuid,text,jsonb,uuid,text) FROM public, anon, authenticated;

COMMIT;
```

- [ ] **Step 2: Apply**

Run: `supabase db query --linked -f schema-v40b-mp-messaging-rpcs.sql`
Expected: no error output.

- [ ] **Step 3: Prove the counter moves the right way (rolled back)**

Run:
```bash
supabase db query --linked "
begin;
insert into globalhire.mp_agencies (id,name,created_by,status)
values ('11111111-1111-1111-1111-111111111111','T',
        '00000000-0000-0000-0000-000000000001','pending_verification');
select globalhire.mp_create_thread_with_message(
  '11111111-1111-1111-1111-111111111111','s','agency',null,'hello','[]'::jsonb,
  '00000000-0000-0000-0000-000000000001','gh') as tid \gset
select gh_unread, agency_unread from globalhire.mp_threads
 where agency_id='11111111-1111-1111-1111-111111111111';
rollback;"
```
Expected: `gh_unread = 0`, `agency_unread = 1` — a `gh` message makes the **agency** side unread.

- [ ] **Step 4: Commit**

```bash
git add schema-v40b-mp-messaging-rpcs.sql
git commit -m "feat(db): unread trigger + mp_mark_thread_read / create / append RPCs (S10)"
```

---

### Task 3: RLS isolation acceptance gate

**Files:**
- Create: `tests/rls/mp-messaging-isolation.sql`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: a 6-check PASS/FAIL gate, same idiom as `tests/rls/mp-isolation.sql` (assertions funnelled through `set_config`/`current_setting` into one final SELECT, because `supabase db query` returns only the last result set).

- [ ] **Step 1: Write the gate**

```sql
-- tests/rls/mp-messaging-isolation.sql
-- Cross-agency isolation gate for S10 (mp_threads / mp_messages / mp_notifications).
-- Run: supabase db query --linked -f tests/rls/mp-messaging-isolation.sql
-- Wraps itself in BEGIN with NO COMMIT — always ends in ROLLBACK.
BEGIN;

INSERT INTO globalhire.mp_agencies (id,name,created_by,status) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a','Agency A','00000000-0000-0000-0000-00000000000a','verified'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','Agency B','00000000-0000-0000-0000-00000000000b','verified');
INSERT INTO globalhire.mp_agency_members (agency_id,user_id,role,status) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','owner','active'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','owner','active');

SELECT globalhire.mp_create_thread_with_message(
  'aaaaaaaa-0000-0000-0000-00000000000a','A thread','agency',null,'a body','[]'::jsonb,
  '00000000-0000-0000-0000-00000000000a','agency');
SELECT globalhire.mp_create_thread_with_message(
  'bbbbbbbb-0000-0000-0000-00000000000b','B thread','agency',null,'b body','[]'::jsonb,
  '00000000-0000-0000-0000-00000000000b','agency');

-- Become Agency A's owner.
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- 1. sees ONLY its own thread
SELECT set_config('chk.threads_scope',
  (SELECT CASE WHEN count(*) = 1 THEN 'PASS (got=1)' ELSE 'FAIL (got='||count(*)::text||')' END
   FROM public.gh_mp_threads), true);

-- 2. cannot read Agency B's messages
SELECT set_config('chk.b_messages_hidden',
  (SELECT CASE WHEN count(*) = 0 THEN 'PASS (got=0)' ELSE 'FAIL (got='||count(*)::text||')' END
   FROM public.gh_mp_messages m JOIN globalhire.mp_threads t ON t.id = m.thread_id
   WHERE t.agency_id = 'bbbbbbbb-0000-0000-0000-00000000000b'), true);

-- 3. positive control — DOES see its own message (proves 2 isn't a blanket-empty view)
SELECT set_config('chk.a_messages_visible',
  (SELECT CASE WHEN count(*) = 1 THEN 'PASS (got=1)' ELSE 'FAIL (got='||count(*)::text||')' END
   FROM public.gh_mp_messages), true);

-- 4. cannot INSERT a message directly (no client write grant exists)
DO $$ BEGIN
  BEGIN
    INSERT INTO public.gh_mp_messages (thread_id, sender_user_id, sender_side, body_md)
    SELECT id,'00000000-0000-0000-0000-00000000000a','gh','forged'
      FROM globalhire.mp_threads LIMIT 1;
    PERFORM set_config('chk.no_client_insert','FAIL (insert succeeded)',true);
  EXCEPTION WHEN insufficient_privilege OR others THEN
    PERFORM set_config('chk.no_client_insert','PASS ('||SQLERRM||')',true);
  END;
END $$;

-- 5. cannot clear the GH-side unread counter
DO $$
DECLARE v_tid uuid; v_gh int;
BEGIN
  SELECT id INTO v_tid FROM globalhire.mp_threads
   WHERE agency_id='aaaaaaaa-0000-0000-0000-00000000000a';
  BEGIN PERFORM globalhire.mp_mark_thread_read(v_tid); EXCEPTION WHEN others THEN NULL; END;
  SELECT gh_unread INTO v_gh FROM globalhire.mp_threads WHERE id = v_tid;
  PERFORM set_config('chk.gh_unread_protected',
    CASE WHEN v_gh = 1 THEN 'PASS (gh_unread still 1)'
         ELSE 'FAIL (gh_unread='||v_gh::text||')' END, true);
END $$;

-- 6. anon sees nothing
SELECT set_config('request.jwt.claims','{"role":"anon"}', true);
SET LOCAL role anon;
DO $$ BEGIN
  BEGIN
    PERFORM count(*) FROM public.gh_mp_threads;
    PERFORM set_config('chk.anon_denied','FAIL (anon could select)',true);
  EXCEPTION WHEN insufficient_privilege OR others THEN
    PERFORM set_config('chk.anon_denied','PASS ('||SQLERRM||')',true);
  END;
END $$;

RESET role;
SELECT unnest(ARRAY['1 threads_scope','2 b_messages_hidden','3 a_messages_visible',
                    '4 no_client_insert','5 gh_unread_protected','6 anon_denied']) AS check,
       unnest(ARRAY[current_setting('chk.threads_scope',true),
                    current_setting('chk.b_messages_hidden',true),
                    current_setting('chk.a_messages_visible',true),
                    current_setting('chk.no_client_insert',true),
                    current_setting('chk.gh_unread_protected',true),
                    current_setting('chk.anon_denied',true)]) AS result;

ROLLBACK;
```

- [ ] **Step 2: Run it — all six must PASS**

Run: `supabase db query --linked -f tests/rls/mp-messaging-isolation.sql`
Expected: six rows, every `result` starting `PASS`. **A single FAIL blocks this task** — fix the policy, do not adjust the test to match the behaviour.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/mp-messaging-isolation.sql
git commit -m "test(db): cross-agency isolation gate for S10 messaging (6 checks)"
```

---

### Task 4: `mp-thread-create` edge function

**Files:**
- Create: `supabase/functions/mp-thread-create/index.ts`
- Create: `supabase/functions/mp-thread-create/index_test.ts`

**Interfaces:**
- Consumes: `globalhire.mp_create_thread_with_message` (Task 2).
- Produces: `POST /functions/v1/mp-thread-create` `{agency_id, subject, context_type, context_id?, body, attachments?}` → `{success:true, thread_id}`. Exports `validateCreateBody(raw)` → `{ok:true,value}|{ok:false,error}` for the unit test.

- [ ] **Step 1: Write the failing unit test**

```ts
// supabase/functions/mp-thread-create/index_test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateCreateBody } from './index.ts';

Deno.test('rejects a missing agency_id', () => {
  const r = validateCreateBody({ subject: 's', body: 'b', context_type: 'agency' });
  assertEquals(r.ok, false);
});

Deno.test('rejects an unknown context_type', () => {
  const r = validateCreateBody({ agency_id: 'a', subject: 's', body: 'b', context_type: 'nope' });
  assertEquals(r.ok, false);
});

Deno.test('rejects an empty body', () => {
  const r = validateCreateBody({ agency_id: 'a', subject: 's', body: '   ', context_type: 'agency' });
  assertEquals(r.ok, false);
});

Deno.test('ignores a client-supplied sender_side', () => {
  const r = validateCreateBody({ agency_id: 'a', subject: 's', body: 'b',
                                 context_type: 'agency', sender_side: 'gh' });
  assertEquals(r.ok, true);
  assertEquals(Object.hasOwn(r.value!, 'sender_side'), false);
});

Deno.test('accepts a valid body', () => {
  const r = validateCreateBody({ agency_id: 'a', subject: 's', body: 'b', context_type: 'agency' });
  assertEquals(r.ok, true);
  assertEquals(r.value!.context_id, null);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `deno test --allow-all supabase/functions/mp-thread-create/index_test.ts`
Expected: FAIL — `index.ts` does not exist.

- [ ] **Step 3: Implement**

```ts
// supabase/functions/mp-thread-create/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const CONTEXTS = ['nomination', 'job', 'agency', 'general'];

export function validateCreateBody(raw: Record<string, unknown>):
  | { ok: true; value: { agency_id: string; subject: string; context_type: string;
                         context_id: string | null; body: string; attachments: unknown[] }; error?: never }
  | { ok: false; value?: never; error: string } {
  const agency_id = String(raw.agency_id ?? '').trim();
  const subject = String(raw.subject ?? '').trim();
  const context_type = String(raw.context_type ?? '').trim();
  const body = String(raw.body ?? '').trim();
  if (!agency_id) return { ok: false, error: 'agency_id required' };
  if (!subject) return { ok: false, error: 'subject required' };
  if (!CONTEXTS.includes(context_type)) return { ok: false, error: 'invalid context_type' };
  if (!body) return { ok: false, error: 'body required' };
  // sender_side is NEVER taken from the client — it is derived below from is_admin().
  return { ok: true, value: { agency_id, subject, context_type,
    context_id: raw.context_id ? String(raw.context_id) : null,
    body, attachments: Array.isArray(raw.attachments) ? raw.attachments : [] } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const parsed = validateCreateBody(await req.json());
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const v = parsed.value;

    const { data: caller } = await svc.from('gh_profiles').select('role').eq('id', user.id).single();
    const isAdmin = caller?.role === 'admin';

    if (!isAdmin) {
      const { data: member } = await svc.schema('globalhire').from('mp_agency_members')
        .select('agency_id').eq('user_id', user.id).eq('agency_id', v.agency_id)
        .eq('status', 'active').maybeSingle();
      if (!member) return json({ error: 'not a member of this agency' }, 403);
    }
    const side = isAdmin ? 'gh' : 'agency';

    const { data, error } = await svc.schema('globalhire')
      .rpc('mp_create_thread_with_message', {
        p_agency_id: v.agency_id, p_subject: v.subject, p_context_type: v.context_type,
        p_context_id: v.context_id, p_body: v.body, p_attachments: v.attachments,
        p_sender: user.id, p_side: side,
      });
    if (error) return json({ error: error.message }, 400);

    return json({ success: true, thread_id: data });
  } catch (e) {
    console.error('mp-thread-create error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
```

- [ ] **Step 4: Run the test — must pass**

Run: `deno test --allow-all supabase/functions/mp-thread-create/index_test.ts`
Expected: 5 passed.

- [ ] **Step 5: Deploy and commit**

```bash
supabase functions deploy mp-thread-create
git add supabase/functions/mp-thread-create/
git commit -m "feat(fn): mp-thread-create — server-derived sender_side, atomic thread+message"
```

---

### Task 5: `mp-thread-post` edge function

**Files:**
- Create: `supabase/functions/mp-thread-post/index.ts`
- Create: `supabase/functions/mp-thread-post/index_test.ts`

**Interfaces:**
- Consumes: `globalhire.mp_append_message` (Task 2).
- Produces: `POST /functions/v1/mp-thread-post` `{thread_id, body, attachments?}` → `{success:true, message_id}`. Exports `validatePostBody(raw)` and `attachmentsInsideAgency(attachments, agencyId)`.

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/mp-thread-post/index_test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validatePostBody, attachmentsInsideAgency } from './index.ts';

const AG = 'aaaaaaaa-0000-0000-0000-00000000000a';

Deno.test('rejects a missing thread_id', () => {
  assertEquals(validatePostBody({ body: 'hi' }).ok, false);
});

Deno.test('rejects an empty body', () => {
  assertEquals(validatePostBody({ thread_id: 't', body: '  ' }).ok, false);
});

Deno.test('accepts a valid body', () => {
  const r = validatePostBody({ thread_id: 't', body: 'hi' });
  assertEquals(r.ok, true);
  assertEquals(r.value!.attachments.length, 0);
});

Deno.test('accepts an attachment inside the agency prefix', () => {
  assertEquals(attachmentsInsideAgency(
    [{ path: `marketplace/agency/${AG}/thread/m1/licence.pdf` }], AG), true);
});

Deno.test('rejects an attachment pointing at another agency', () => {
  assertEquals(attachmentsInsideAgency(
    [{ path: 'marketplace/agency/bbbbbbbb-0000-0000-0000-00000000000b/thread/m1/x.pdf' }], AG), false);
});

Deno.test('rejects a traversal attempt', () => {
  assertEquals(attachmentsInsideAgency(
    [{ path: `marketplace/agency/${AG}/../../recruiter-clients/x/secret.pdf` }], AG), false);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `deno test --allow-all supabase/functions/mp-thread-post/index_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// supabase/functions/mp-thread-post/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

export function validatePostBody(raw: Record<string, unknown>):
  | { ok: true; value: { thread_id: string; body: string; attachments: { path: string }[] }; error?: never }
  | { ok: false; value?: never; error: string } {
  const thread_id = String(raw.thread_id ?? '').trim();
  const body = String(raw.body ?? '').trim();
  if (!thread_id) return { ok: false, error: 'thread_id required' };
  if (!body) return { ok: false, error: 'body required' };
  return { ok: true, value: { thread_id, body,
    attachments: Array.isArray(raw.attachments) ? raw.attachments as { path: string }[] : [] } };
}

// An attachment path must sit literally under this agency's prefix. Reject any '..'
// outright rather than trying to normalise it.
export function attachmentsInsideAgency(attachments: { path?: string }[], agencyId: string): boolean {
  const prefix = `marketplace/agency/${agencyId}/`;
  return attachments.every((a) => {
    const p = String(a?.path ?? '');
    return p.startsWith(prefix) && !p.includes('..');
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const parsed = validatePostBody(await req.json());
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const v = parsed.value;

    const { data: thread, error: tErr } = await svc.schema('globalhire').from('mp_threads')
      .select('id, agency_id').eq('id', v.thread_id).single();
    if (tErr || !thread) return json({ error: 'thread not found' }, 404);

    const { data: caller } = await svc.from('gh_profiles').select('role').eq('id', user.id).single();
    const isAdmin = caller?.role === 'admin';
    if (!isAdmin) {
      const { data: member } = await svc.schema('globalhire').from('mp_agency_members')
        .select('agency_id').eq('user_id', user.id).eq('agency_id', thread.agency_id)
        .eq('status', 'active').maybeSingle();
      if (!member) return json({ error: 'not a member of this agency' }, 403);
    }

    if (!attachmentsInsideAgency(v.attachments, thread.agency_id)) {
      return json({ error: 'attachment path outside this agency' }, 400);
    }

    const { data, error } = await svc.schema('globalhire').rpc('mp_append_message', {
      p_thread_id: v.thread_id, p_body: v.body, p_attachments: v.attachments,
      p_sender: user.id, p_side: isAdmin ? 'gh' : 'agency',
    });
    if (error) return json({ error: error.message }, 400);

    return json({ success: true, message_id: data });
  } catch (e) {
    console.error('mp-thread-post error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
```

- [ ] **Step 4: Run the test — must pass**

Run: `deno test --allow-all supabase/functions/mp-thread-post/index_test.ts`
Expected: 6 passed.

- [ ] **Step 5: Deploy and commit**

```bash
supabase functions deploy mp-thread-post
git add supabase/functions/mp-thread-post/
git commit -m "feat(fn): mp-thread-post — attachment prefix confinement + derived sender_side"
```

---

### Task 6: `mp-thread-attachment` edge function

**Files:**
- Create: `supabase/functions/mp-thread-attachment/index.ts`
- Create: `supabase/functions/mp-thread-attachment/index_test.ts`

**Interfaces:**
- Consumes: Task 1's tables; the existing `gh-applicant-documents` bucket.
- Produces: `POST /functions/v1/mp-thread-attachment` `{path}` → `{success:true, url}` (signed, 300s). Exports `parseAgencyFromPath(path)`.

**Why this exists:** an admin is not an agency member, so `my_agency_ids()` excludes them and storage RLS denies the read. `gh-applicant-documents` is a shared bucket (recruiter and applicant paths live there too) and `schema-v38` exists because a careless predicate on it broke document listing for every authenticated user. So authorise here, with the service role, and leave storage RLS alone.

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/mp-thread-attachment/index_test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { parseAgencyFromPath } from './index.ts';

const AG = 'aaaaaaaa-0000-0000-0000-00000000000a';

Deno.test('extracts the agency id', () => {
  assertEquals(parseAgencyFromPath(`marketplace/agency/${AG}/thread/m1/x.pdf`), AG);
});

Deno.test('returns null for a non-marketplace path', () => {
  assertEquals(parseAgencyFromPath('recruiter-clients/abc/x.pdf'), null);
});

Deno.test('returns null for a traversal attempt', () => {
  assertEquals(parseAgencyFromPath(`marketplace/agency/${AG}/../x.pdf`), null);
});

Deno.test('returns null for a too-short path', () => {
  assertEquals(parseAgencyFromPath('marketplace/agency'), null);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `deno test --allow-all supabase/functions/mp-thread-attachment/index_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// supabase/functions/mp-thread-attachment/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

export function parseAgencyFromPath(path: string): string | null {
  if (!path || path.includes('..')) return null;
  const parts = path.split('/');
  if (parts.length < 4) return null;
  if (parts[0] !== 'marketplace' || parts[1] !== 'agency') return null;
  return parts[2] || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const path = String((await req.json()).path ?? '');
    const agencyId = parseAgencyFromPath(path);
    if (!agencyId) return json({ error: 'invalid path' }, 400);

    const { data: caller } = await svc.from('gh_profiles').select('role').eq('id', user.id).single();
    if (caller?.role !== 'admin') {
      const { data: member } = await svc.schema('globalhire').from('mp_agency_members')
        .select('agency_id').eq('user_id', user.id).eq('agency_id', agencyId)
        .eq('status', 'active').maybeSingle();
      if (!member) return json({ error: 'forbidden' }, 403);
    }

    const { data, error } = await svc.storage.from('gh-applicant-documents')
      .createSignedUrl(path, 300);
    if (error) return json({ error: error.message }, 400);

    return json({ success: true, url: data.signedUrl });
  } catch (e) {
    console.error('mp-thread-attachment error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
```

- [ ] **Step 4: Run the test — must pass**

Run: `deno test --allow-all supabase/functions/mp-thread-attachment/index_test.ts`
Expected: 4 passed.

- [ ] **Step 5: Deploy and commit**

```bash
supabase functions deploy mp-thread-attachment
git add supabase/functions/mp-thread-attachment/
git commit -m "feat(fn): mp-thread-attachment — member-or-admin signed URLs, storage RLS untouched"
```

---

### Task 7: `mp-notify` fan-out function

**Files:**
- Create: `supabase/functions/mp-notify/index.ts`
- Create: `supabase/functions/mp-notify/index_test.ts`

**Interfaces:**
- Consumes: Task 1's `mp_notifications`; `INTERNAL_TRIGGER_SECRET`; `GMAIL_USER` / `GMAIL_APP_PASSWORD` / `SITE_URL`.
- Produces: `POST /functions/v1/mp-notify` `{message_id}` → `{success:true, notified:n}`. Exports `buildNotification(side, agencyName, subject, threadId)`.

**Security:** recipients are resolved **server-side from `message_id`** and never read from the payload — the `notify-interest` rule.

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/mp-notify/index_test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildNotification } from './index.ts';

Deno.test('a gh message notifies the agency and links to the partner inbox', () => {
  const n = buildNotification('gh', 'Acme Recruit', 'Licence needed', 't1');
  assertEquals(n.type, 'new_message');
  assertStringIncludes(n.title, 'GlobalHire');
  assertEquals(n.link, 'partners-messages.html?thread=t1');
});

Deno.test('an agency message notifies staff and links to the admin inbox', () => {
  const n = buildNotification('agency', 'Acme Recruit', 'Licence needed', 't1');
  assertStringIncludes(n.title, 'Acme Recruit');
  assertEquals(n.link, 'admin-mp-messages.html?thread=t1');
});

Deno.test('the subject is carried into the body', () => {
  assertStringIncludes(buildNotification('gh', 'A', 'Licence needed', 't1').body, 'Licence needed');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `deno test --allow-all supabase/functions/mp-notify/index_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// supabase/functions/mp-notify/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.10';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

export function buildNotification(side: string, agencyName: string, subject: string, threadId: string) {
  const fromGh = side === 'gh';
  return {
    type: 'new_message',
    title: fromGh ? 'New message from GlobalHire' : `New message from ${agencyName}`,
    body: subject,
    link: fromGh ? `partners-messages.html?thread=${threadId}`
                 : `admin-mp-messages.html?thread=${threadId}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const secret = Deno.env.get('INTERNAL_TRIGGER_SECRET');
    if (!secret || req.headers.get('x-internal-secret') !== secret) {
      return json({ error: 'unauthorized' }, 401);
    }
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const message_id = String((await req.json()).message_id ?? '');
    if (!message_id) return json({ error: 'message_id required' }, 400);

    const { data: msg } = await svc.schema('globalhire').from('mp_messages')
      .select('id, thread_id, sender_side, sender_user_id, body_md').eq('id', message_id).single();
    if (!msg) return json({ error: 'message not found' }, 404);

    const { data: thread } = await svc.schema('globalhire').from('mp_threads')
      .select('id, agency_id, subject').eq('id', msg.thread_id).single();
    if (!thread) return json({ error: 'thread not found' }, 404);

    const { data: agency } = await svc.schema('globalhire').from('mp_agencies')
      .select('name').eq('id', thread.agency_id).single();

    // Recipients are resolved HERE, never from the payload.
    let recipientIds: string[] = [];
    if (msg.sender_side === 'gh') {
      const { data: members } = await svc.schema('globalhire').from('mp_agency_members')
        .select('user_id').eq('agency_id', thread.agency_id).eq('status', 'active');
      recipientIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
    } else {
      const { data: admins } = await svc.from('gh_profiles').select('id').eq('role', 'admin');
      recipientIds = (admins ?? []).map((a: { id: string }) => a.id);
    }
    recipientIds = recipientIds.filter((id) => id !== msg.sender_user_id);

    const n = buildNotification(msg.sender_side, agency?.name ?? 'an agency', thread.subject, thread.id);

    const smtpUser = Deno.env.get('GMAIL_USER') || 'support@elabsolution.org';
    const smtpPass = Deno.env.get('GMAIL_APP_PASSWORD');
    const site = Deno.env.get('SITE_URL') || 'https://globalhire.elabsolution.org';
    let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
    if (smtpPass) {
      transport = nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } });
    }

    for (const uid of recipientIds) {
      let emailed = false;
      if (transport) {
        try {
          const { data: u } = await svc.auth.admin.getUserById(uid);
          const to = u?.user?.email;
          if (to) {
            await transport.sendMail({
              from: `"GlobalHire Partners" <${smtpUser}>`, to, subject: n.title,
              text: `${n.body}\n\n${msg.body_md}\n\nOpen: ${site}/${n.link}`,
            });
            emailed = true;
          }
        } catch (e) {
          // Non-fatal: a dead SMTP must never lose the notification row.
          console.warn('mp-notify email failed (non-fatal):', (e as Error).message);
        }
      }
      await svc.schema('globalhire').from('mp_notifications').insert({
        user_id: uid,
        agency_id: msg.sender_side === 'gh' ? thread.agency_id : null,
        type: n.type, title: n.title, body: n.body, link: n.link, email_sent: emailed,
      });
    }
    if (transport) transport.close();

    return json({ success: true, notified: recipientIds.length });
  } catch (e) {
    console.error('mp-notify error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
});
```

- [ ] **Step 4: Run the test — must pass**

Run: `deno test --allow-all supabase/functions/mp-notify/index_test.ts`
Expected: 3 passed.

- [ ] **Step 5: Deploy, then verify the secret gate rejects an unauthenticated call**

```bash
supabase functions deploy mp-notify
curl -s -X POST https://evzhnsugmvtqgmvzwyix.supabase.co/functions/v1/mp-notify \
  -H 'Content-Type: application/json' -d '{"message_id":"x"}'
```
Expected: `{"error":"unauthorized"}` — no secret header, so it must refuse.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/mp-notify/
git commit -m "feat(fn): mp-notify fan-out — server-resolved recipients, non-fatal email"
```

---

### Task 8: Wire the `pg_net` trigger

**Files:**
- Create: `schema-v41-mp-notify-trigger.sql`

**Interfaces:**
- Consumes: `mp-notify` (Task 7 — **must be deployed first**, or every early message silently fails to notify).

- [ ] **Step 1: Write the migration**

```sql
-- schema-v41-mp-notify-trigger.sql
-- Fan-out: mp_messages insert -> pg_net -> mp-notify.
-- Mirrors schema-v16-interest-notify.sql. Substitute <INTERNAL_TRIGGER_SECRET> at apply
-- time; the literal placeholder is what stays in git.
-- PREREQ: `supabase functions deploy mp-notify` has already run.
BEGIN;

CREATE OR REPLACE FUNCTION globalhire.notify_mp_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://evzhnsugmvtqgmvzwyix.supabase.co/functions/v1/mp-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', '<INTERNAL_TRIGGER_SECRET>'
    ),
    body    := jsonb_build_object('message_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_mp_message ON globalhire.mp_messages;
CREATE TRIGGER trg_notify_mp_message
  AFTER INSERT ON globalhire.mp_messages
  FOR EACH ROW EXECUTE FUNCTION globalhire.notify_mp_message();

COMMIT;
```

- [ ] **Step 2: Apply with the real secret substituted**

```bash
SECRET=$(supabase secrets list | grep INTERNAL_TRIGGER_SECRET || echo "ask the user")
sed "s|<INTERNAL_TRIGGER_SECRET>|$REAL_SECRET|" schema-v41-mp-notify-trigger.sql \
  > /tmp/v41.sql && supabase db query --linked -f /tmp/v41.sql && rm /tmp/v41.sql
```
Expected: no error. **Never commit the substituted file.**

- [ ] **Step 3: Confirm the placeholder is what got committed**

Run: `grep -c '<INTERNAL_TRIGGER_SECRET>' schema-v41-mp-notify-trigger.sql`
Expected: `1`. If this is `0`, a real secret is about to be committed — stop.

- [ ] **Step 4: Commit**

```bash
git add schema-v41-mp-notify-trigger.sql
git commit -m "feat(db): pg_net trigger fanning mp_messages inserts to mp-notify"
```

---

### Task 9: `js/mp-messages.js` — shared thread module

**Files:**
- Create: `js/mp-messages.js`

**Interfaces:**
- Consumes: `MP.mpFrom`, `MP.callFn`, `MP.esc` from `js/mp-core.js`; `window.ghSupabase`.
- Produces: `window.MPMsg` with `listThreads(agencyId)`, `loadThread(threadId)`, `renderThread(el, messages)`, `post(threadId, body, files)`, `createThread(opts)`, `markRead(threadId)`, `attachmentUrl(path)`, `uploadAttachments(agencyId, messageIdSeed, files)`.

- [ ] **Step 1: Write the module**

```js
/* ============================================
   GLOBALHIRE@ELAB — Partner Marketplace: shared messaging module
   Loaded after js/mp-core.js. Used by partners-messages.html,
   admin-mp-messages.html, and the Messages tab in admin-mp-agencies.html.

   Contract notes:
   - Every write goes through an edge fn; there is no client INSERT grant.
   - Attachments are stored as PATHS. Signed URLs are minted on demand and
     never persisted (they expire, and a stored one is a leak).
   ============================================ */
(function () {
  var BUCKET = 'gh-applicant-documents';
  var MAX_BYTES = 10 * 1024 * 1024;
  var OK_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

  function esc(s) { return window.MP.esc(s); }

  async function listThreads(agencyId) {
    var q = window.MP.mpFrom('threads')
      .select('id, agency_id, subject, context_type, last_message_at, gh_unread, agency_unread')
      .order('last_message_at', { ascending: false });
    if (agencyId) q = q.eq('agency_id', agencyId);
    var r = await q;
    return r.error ? { error: r.error.message, rows: [] } : { rows: r.data || [] };
  }

  async function loadThread(threadId) {
    var r = await window.MP.mpFrom('messages')
      .select('id, sender_side, sender_user_id, body_md, attachments, created_at')
      .eq('thread_id', threadId).order('created_at', { ascending: true });
    return r.error ? { error: r.error.message, rows: [] } : { rows: r.data || [] };
  }

  function renderThread(el, messages) {
    el.innerHTML = messages.map(function (m) {
      var who = m.sender_side === 'gh' ? 'GlobalHire' : 'Agency';
      var files = (m.attachments || []).map(function (a) {
        return '<a href="#" class="mp-att" data-path="' + esc(a.path) + '">' +
               esc(a.name || a.path.split('/').pop()) + '</a>';
      }).join(' ');
      return '<div class="mp-msg-row mp-side-' + esc(m.sender_side) + '">' +
               '<div class="mp-msg-who">' + esc(who) + ' · ' +
                 esc(new Date(m.created_at).toLocaleString()) + '</div>' +
               '<div class="mp-msg-body">' + esc(m.body_md) + '</div>' +
               (files ? '<div class="mp-msg-files">' + files + '</div>' : '') +
             '</div>';
    }).join('');

    // Signed URLs are minted per click, never rendered into the page up front.
    Array.prototype.forEach.call(el.querySelectorAll('.mp-att'), function (a) {
      a.addEventListener('click', async function (e) {
        e.preventDefault();
        var out = await attachmentUrl(a.getAttribute('data-path'));
        if (out.url) window.open(out.url, '_blank', 'noopener');
        else a.textContent = a.textContent + ' (unavailable)';
      });
    });
  }

  async function attachmentUrl(path) {
    var r = await window.MP.callFn('mp-thread-attachment', { path: path });
    return r.ok && r.data && r.data.url ? { url: r.data.url } : { error: 'could not open file' };
  }

  function validateFiles(files) {
    for (var i = 0; i < files.length; i++) {
      if (files[i].size > MAX_BYTES) return files[i].name + ' is larger than 10MB.';
      if (OK_MIME.indexOf(files[i].type) < 0) return files[i].name + ' must be a PDF, JPEG, PNG or WebP.';
    }
    return null;
  }

  // Uploaded BEFORE the message row exists, so the folder is keyed by a client seed
  // rather than message_id. The path still sits under the agency prefix, which is what
  // both storage RLS and mp-thread-post enforce.
  async function uploadAttachments(agencyId, seed, files) {
    var out = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var path = 'marketplace/agency/' + agencyId + '/thread/' + seed + '/' + f.name;
      var up = await window.ghSupabase.storage.from(BUCKET).upload(path, f, { upsert: true });
      if (up.error) throw up.error;
      out.push({ path: path, name: f.name, size: f.size, mime: f.type });
    }
    return out;
  }

  async function post(threadId, agencyId, body, files) {
    var bad = validateFiles(files || []);
    if (bad) return { error: bad };
    var attachments = [];
    try {
      if (files && files.length) {
        attachments = await uploadAttachments(agencyId, 'm' + Date.now(), files);
      }
    } catch (e) {
      // Abort rather than post a message referencing a file that isn't there.
      return { error: 'Attachment upload failed: ' + (e.message || String(e)) };
    }
    var r = await window.MP.callFn('mp-thread-post',
      { thread_id: threadId, body: body, attachments: attachments });
    return r.ok ? { ok: true } : { error: (r.data && r.data.error) || 'Could not send.' };
  }

  async function createThread(opts) {
    var r = await window.MP.callFn('mp-thread-create', {
      agency_id: opts.agencyId, subject: opts.subject,
      context_type: opts.contextType || 'agency', context_id: opts.contextId || null,
      body: opts.body, attachments: opts.attachments || [],
    });
    return r.ok && r.data ? { ok: true, thread_id: r.data.thread_id }
                          : { error: (r.data && r.data.error) || 'Could not start the thread.' };
  }

  async function markRead(threadId) {
    try { await window.ghSupabase.rpc('mp_mark_thread_read', { p_thread_id: threadId }); }
    catch (e) { /* non-fatal: an unread badge is cosmetic */ }
  }

  window.MPMsg = { listThreads: listThreads, loadThread: loadThread, renderThread: renderThread,
    post: post, createThread: createThread, markRead: markRead,
    attachmentUrl: attachmentUrl, uploadAttachments: uploadAttachments,
    validateFiles: validateFiles };
})();
```

- [ ] **Step 2: Syntax check**

Run: `node --check js/mp-messages.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add js/mp-messages.js
git commit -m "feat(partners): shared MPMsg messaging module (threads, posting, attachments)"
```

---

### Task 10: `partners-messages.html` — partner inbox

**Files:**
- Create: `partners-messages.html`
- Modify: `js/mp-dashboard.js` (nav link into the inbox)

**Interfaces:**
- Consumes: `MPMsg` (Task 9), `MP` (`js/mp-core.js`).

- [ ] **Step 1: Build the page on the partners-dashboard shell**

Copy the `<head>`, styles, and header shell from `partners-dashboard.html` verbatim so the surface matches, then use this body:

```html
  <div id="mp-error" hidden></div>
  <div id="mp-messages-body">
    <div class="mp-inbox">
      <aside class="mp-thread-list" id="mp-thread-list"></aside>
      <section class="mp-thread-view">
        <h2 id="mp-thread-subject">Select a conversation</h2>
        <div id="mp-thread-messages"></div>
        <form id="mp-reply-form" hidden>
          <textarea id="mp-reply-body" required placeholder="Write a reply…"></textarea>
          <input type="file" id="mp-reply-files" multiple accept=".pdf,.png,.jpg,.jpeg,.webp">
          <button type="submit" class="mp-btn">Send</button>
          <div id="mp-reply-msg" class="mp-msg" role="status" aria-live="polite"></div>
        </form>
      </section>
    </div>
  </div>
  <script src="js/supabase-client.js"></script>
  <script src="js/mp-core.js"></script>
  <script src="js/mp-messages.js"></script>
  <script src="js/mp-messages-partner.js"></script>
```

- [ ] **Step 2: Write `js/mp-messages-partner.js`**

```js
(function () {
  var listEl = document.getElementById('mp-thread-list');
  var msgsEl = document.getElementById('mp-thread-messages');
  var subjEl = document.getElementById('mp-thread-subject');
  var form = document.getElementById('mp-reply-form');
  if (!listEl || !form) return;
  var current = null;

  async function refreshList() {
    var out = await window.MPMsg.listThreads(window.MP.membership.agency_id);
    listEl.innerHTML = out.rows.length
      ? out.rows.map(function (t) {
          return '<button class="mp-thread-item" data-id="' + window.MP.esc(t.id) + '">' +
                 window.MP.esc(t.subject) +
                 (t.agency_unread > 0 ? ' <span class="mp-badge">' + t.agency_unread + '</span>' : '') +
                 '</button>';
        }).join('')
      : '<p class="mp-empty">No messages yet. GlobalHire will reach out here if anything is needed.</p>';
    Array.prototype.forEach.call(listEl.querySelectorAll('.mp-thread-item'), function (b) {
      b.addEventListener('click', function () { open(b.getAttribute('data-id'), b.textContent); });
    });
  }

  async function open(id, subject) {
    current = id;
    subjEl.textContent = subject;
    var out = await window.MPMsg.loadThread(id);
    window.MPMsg.renderThread(msgsEl, out.rows);
    form.hidden = false;
    await window.MPMsg.markRead(id);
    refreshList();
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var status = document.getElementById('mp-reply-msg');
    status.textContent = 'Sending…';
    var body = document.getElementById('mp-reply-body').value.trim();
    var files = document.getElementById('mp-reply-files').files;
    var r = await window.MPMsg.post(current, window.MP.membership.agency_id, body, files);
    if (r.error) { status.textContent = r.error; return; }
    status.textContent = 'Sent.';
    document.getElementById('mp-reply-body').value = '';
    document.getElementById('mp-reply-files').value = '';
    open(current, subjEl.textContent);
  });

  // Any constraint failure must be visible, not a silent cancelled submit.
  form.addEventListener('invalid', function (e) {
    var status = document.getElementById('mp-reply-msg');
    if (status && e.target) status.textContent = 'Not sent — ' + e.target.validationMessage;
  }, true);

  (async function () {
    await window.MP.init();
    if (window.MP.status === 'error') { return; }
    if (!window.MP.requireAgency({ to: 'partners-signup.html' })) return;
    refreshList();
    var pre = new URLSearchParams(location.search).get('thread');
    if (pre) open(pre, 'Conversation');
  })();
})();
```

- [ ] **Step 3: Verify it loads without console errors**

Serve locally (`python3 -m http.server 8080`), open `/partners-messages.html` signed out.
Expected: redirect to `login.html` (the `requireAgency` guard), no uncaught exception in the console.

- [ ] **Step 4: Commit**

```bash
git add partners-messages.html js/mp-messages-partner.js js/mp-dashboard.js
git commit -m "feat(partners): partner message inbox (partners-messages.html)"
```

---

### Task 11: `admin-mp-messages.html` — cross-agency admin inbox

**Files:**
- Create: `admin-mp-messages.html`
- Create: `js/mp-messages-admin.js`
- Modify: the admin sidebar block in `admin-mp-agencies.html`, `recruiters.html`, `dashboard.html`

**Interfaces:**
- Consumes: `MPMsg` (Task 9).

- [ ] **Step 1: Build the page on the `admin-mp-agencies.html` shell**

Copy its `<head>`, sidebar, and header verbatim (`<body data-auth-role="admin">` is required — that is what `js/auth-guard.js` enforces), then:

```html
  <div class="page-head">
    <h1>Partner Messages</h1>
    <select id="mp-msg-filter" class="select-input" style="width:220px;">
      <option value="unread" selected>Needs a reply</option>
      <option value="all">All conversations</option>
    </select>
  </div>
  <div class="mp-inbox">
    <aside class="mp-thread-list" id="mp-thread-list"></aside>
    <section class="mp-thread-view">
      <h2 id="mp-thread-subject">Select a conversation</h2>
      <div id="mp-thread-messages"></div>
      <form id="mp-reply-form" hidden>
        <textarea id="mp-reply-body" required placeholder="Reply to this agency…"></textarea>
        <input type="file" id="mp-reply-files" multiple accept=".pdf,.png,.jpg,.jpeg,.webp">
        <button type="submit" class="btn btn-primary btn-sm">Send</button>
        <div id="mp-reply-msg" class="mp-msg" role="status" aria-live="polite"></div>
      </form>
    </section>
  </div>
```

- [ ] **Step 2: Write `js/mp-messages-admin.js`**

Same structure as Task 10's partner script, with three differences: threads are listed **unfiltered by agency** (admins see all), the list filter shows `gh_unread > 0` by default, and each row is labelled with its agency name.

```js
(function () {
  var listEl = document.getElementById('mp-thread-list');
  var filter = document.getElementById('mp-msg-filter');
  var msgsEl = document.getElementById('mp-thread-messages');
  var subjEl = document.getElementById('mp-thread-subject');
  var form = document.getElementById('mp-reply-form');
  if (!listEl || !form || !filter) return;
  var current = null, currentAgency = null;

  async function refreshList() {
    var r = await window.MP.mpFrom('threads')
      .select('id, agency_id, subject, gh_unread, last_message_at')
      .order('last_message_at', { ascending: false });
    var rows = r.data || [];
    if (filter.value === 'unread') rows = rows.filter(function (t) { return t.gh_unread > 0; });

    var names = {};
    var ar = await window.MP.mpFrom('agencies').select('id, name');
    (ar.data || []).forEach(function (a) { names[a.id] = a.name; });

    listEl.innerHTML = rows.length
      ? rows.map(function (t) {
          return '<button class="mp-thread-item" data-id="' + window.MP.esc(t.id) +
                 '" data-agency="' + window.MP.esc(t.agency_id) + '">' +
                 '<strong>' + window.MP.esc(names[t.agency_id] || 'Agency') + '</strong><br>' +
                 window.MP.esc(t.subject) +
                 (t.gh_unread > 0 ? ' <span class="mp-badge">' + t.gh_unread + '</span>' : '') +
                 '</button>';
        }).join('')
      : '<p class="mp-empty">Nothing waiting on a reply.</p>';

    Array.prototype.forEach.call(listEl.querySelectorAll('.mp-thread-item'), function (b) {
      b.addEventListener('click', function () {
        open(b.getAttribute('data-id'), b.getAttribute('data-agency'), b.textContent);
      });
    });
  }

  async function open(id, agencyId, subject) {
    current = id; currentAgency = agencyId;
    subjEl.textContent = subject;
    var out = await window.MPMsg.loadThread(id);
    window.MPMsg.renderThread(msgsEl, out.rows);
    form.hidden = false;
    await window.MPMsg.markRead(id);
    refreshList();
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var status = document.getElementById('mp-reply-msg');
    status.textContent = 'Sending…';
    var body = document.getElementById('mp-reply-body').value.trim();
    var files = document.getElementById('mp-reply-files').files;
    var r = await window.MPMsg.post(current, currentAgency, body, files);
    if (r.error) { status.textContent = r.error; return; }
    status.textContent = 'Sent.';
    document.getElementById('mp-reply-body').value = '';
    document.getElementById('mp-reply-files').value = '';
    open(current, currentAgency, subjEl.textContent);
  });

  filter.addEventListener('change', refreshList);
  window.addEventListener('gh:auth-ready', function () {
    window.MP.init().then(function () {
      refreshList();
      var pre = new URLSearchParams(location.search).get('thread');
      if (pre) open(pre, null, 'Conversation');
    });
  });
})();
```

- [ ] **Step 3: Add the sidebar link**

In the shared admin sidebar block, directly after the `admin-mp-agencies.html` item:

```html
        <a class="nav-item" href="admin-mp-messages.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Partner Messages
        </a>
```

- [ ] **Step 4: Verify the guard**

Open `/admin-mp-messages.html` signed out.
Expected: redirect to `login.html`.

- [ ] **Step 5: Commit**

```bash
git add admin-mp-messages.html js/mp-messages-admin.js admin-mp-agencies.html recruiters.html dashboard.html
git commit -m "feat(admin): cross-agency partner message inbox + sidebar entry"
```

---

### Task 12: Messages tab in the agency review drawer

**Files:**
- Modify: `admin-mp-agencies.html` (drawer markup), `js/mp-agencies-admin.js:130-175`

**Interfaces:**
- Consumes: `MPMsg.createThread`, `MPMsg.listThreads`, `MPMsg.post`.

**Why here:** this is where the decision to ask for a document is actually made. Requiring a hop to another page to ask the question is what makes the feature go unused.

- [ ] **Step 1: Add a "Request a document" composer to the drawer**

In `renderDrawer` in `js/mp-agencies-admin.js`, alongside the existing Verify / Reject / Suspend buttons:

```js
      '<div class="mp-drawer-messages">' +
        '<h4>Messages</h4>' +
        '<div id="mp-drawer-threads"></div>' +
        '<form id="mp-drawer-compose">' +
          '<input class="mp-input" id="mp-drawer-subject" placeholder="Subject (e.g. Trade licence needed)" required>' +
          '<textarea class="mp-input" id="mp-drawer-body" placeholder="What do you need from this agency?" required></textarea>' +
          '<button type="submit" class="btn btn-primary btn-sm">Send to agency</button>' +
          '<div id="mp-drawer-msg" class="mp-msg" role="status" aria-live="polite"></div>' +
        '</form>' +
      '</div>' +
```

- [ ] **Step 2: Wire it**

```js
  var compose = document.getElementById('mp-drawer-compose');
  if (compose) {
    compose.addEventListener('submit', async function (e) {
      e.preventDefault();
      var status = document.getElementById('mp-drawer-msg');
      status.textContent = 'Sending…';
      var out = await window.MPMsg.createThread({
        agencyId: id,
        subject: document.getElementById('mp-drawer-subject').value.trim(),
        contextType: 'agency',
        body: document.getElementById('mp-drawer-body').value.trim(),
      });
      status.textContent = out.error
        ? out.error
        : 'Sent. The agency is emailed and sees it in their portal — they stay in the queue.';
      if (!out.error) compose.reset();
    });
    compose.addEventListener('invalid', function (e) {
      var status = document.getElementById('mp-drawer-msg');
      if (status && e.target) status.textContent = 'Not sent — ' + e.target.validationMessage;
    }, true);
  }
```

- [ ] **Step 3: Add the script tag**

In `admin-mp-agencies.html`, before `js/mp-agencies-admin.js`:
```html
  <script src="js/mp-core.js"></script>
  <script src="js/mp-messages.js"></script>
```

- [ ] **Step 4: Syntax check and commit**

```bash
node --check js/mp-agencies-admin.js
git add admin-mp-agencies.html js/mp-agencies-admin.js
git commit -m "feat(admin): ask an agency for a document from the review drawer, without rejecting"
```

---

### Task 13: Notification bell, both sides

**Files:**
- Create: `js/mp-bell.js`
- Modify: `partners-dashboard.html`, `partners-onboarding.html`, `partners-messages.html`, `admin-mp-agencies.html`, `admin-mp-messages.html`

**Interfaces:**
- Consumes: `gh_mp_notifications` (Task 1).
- Produces: `window.MPBell.mount(el)`.

- [ ] **Step 1: Write the bell**

```js
(function () {
  async function unread() {
    var r = await window.ghSupabase.from('gh_mp_notifications')
      .select('id, title, body, link, created_at')
      .is('read_at', null).order('created_at', { ascending: false }).limit(20);
    return r.data || [];
  }

  async function mount(el) {
    if (!el) return;
    var rows = await unread();
    el.innerHTML =
      '<button class="mp-bell-btn" aria-label="Notifications">🔔' +
      (rows.length ? '<span class="mp-badge">' + rows.length + '</span>' : '') +
      '</button><div class="mp-bell-menu" hidden>' +
      (rows.length
        ? rows.map(function (n) {
            return '<a href="' + window.MP.esc(n.link || '#') + '" data-id="' + window.MP.esc(n.id) + '">' +
                   '<strong>' + window.MP.esc(n.title) + '</strong><br>' +
                   window.MP.esc(n.body || '') + '</a>';
          }).join('')
        : '<p class="mp-empty">Nothing new.</p>') +
      '</div>';

    var btn = el.querySelector('.mp-bell-btn');
    var menu = el.querySelector('.mp-bell-menu');
    btn.addEventListener('click', function () { menu.hidden = !menu.hidden; });

    // Mark read on click-through. read_at is the only column the guard lets us touch.
    Array.prototype.forEach.call(el.querySelectorAll('[data-id]'), function (a) {
      a.addEventListener('click', function () {
        window.ghSupabase.from('gh_mp_notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', a.getAttribute('data-id'));
      });
    });
  }

  window.MPBell = { mount: mount, unread: unread };
})();
```

- [ ] **Step 2: Mount it**

Add `<div id="mp-bell"></div>` to each listed page's header, plus:
```html
  <script src="js/mp-bell.js"></script>
  <script>window.addEventListener('load', function(){ window.MPBell.mount(document.getElementById('mp-bell')); });</script>
```

- [ ] **Step 3: Confirm the column guard actually holds**

Run:
```bash
supabase db query --linked "
begin;
set local role authenticated;
set local request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-000000000001\",\"role\":\"authenticated\"}';
update public.gh_mp_notifications set title = 'hijacked' where user_id = '00000000-0000-0000-0000-000000000001';
rollback;"
```
Expected: `ERROR: mp_notifications: only read_at may be changed`. A success here means the guard is not attached — stop and fix Task 1.

- [ ] **Step 4: Commit**

```bash
git add js/mp-bell.js partners-dashboard.html partners-onboarding.html partners-messages.html admin-mp-agencies.html admin-mp-messages.html
git commit -m "feat(partners): unread notification bell on both partner and admin surfaces"
```

---

### Task 14: Verification notifications + the pending banner

**Files:**
- Modify: `supabase/functions/mp-agency-verify/index.ts:46-70`, `js/mp-onboarding.js:76-88`

**Interfaces:**
- Consumes: `mp_notifications` (Task 1).

- [ ] **Step 1: Write an `mp_notifications` row in `mp-agency-verify`**

Directly after the existing email block, before `return json({ success: true, status })`:

```ts
    const NOTIF_FOR: Record<string, string> = {
      verified: 'agency_verified', rejected: 'agency_rejected', suspended: 'agency_suspended',
    };
    try {
      await svc.schema('globalhire').from('mp_notifications').insert({
        user_id: agency.created_by,
        agency_id: agency.id,
        type: NOTIF_FOR[status],
        title: `Agency ${status}`,
        body: note ?? null,
        link: 'partners-dashboard.html',
        email_sent: Boolean(to && smtpPass),
      });
    } catch (e) {
      // Non-fatal, same rule as the email: never roll back a completed status change.
      console.warn('verify notification insert failed (non-fatal):', (e as Error).message);
    }
```

- [ ] **Step 2: Point the pending banner at the inbox**

Replace the `pending_verification` line in the `map` in `renderBanner`:

```js
      pending_verification: 'Your agency is under review. We’ll email you when it’s verified. ' +
        'You can complete your profile now — and check Messages if we’ve asked you for anything.',
```

And after `banner.textContent = map[s] || '';` add:

```js
    if (s === 'pending_verification' || s === 'verified') {
      var a = document.createElement('a');
      a.href = 'partners-messages.html';
      a.className = 'mp-btn';
      a.textContent = 'Open Messages';
      banner.appendChild(document.createTextNode(' '));
      banner.appendChild(a);
    }
```

- [ ] **Step 3: Check and deploy**

```bash
node --check js/mp-onboarding.js
supabase functions deploy mp-agency-verify
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/mp-agency-verify/index.ts js/mp-onboarding.js
git commit -m "feat(partners): verification writes a notification; pending banner links to Messages"
```

---

### Task 15: End-to-end test and production smoke

**Files:**
- Modify: `tests/partners.spec.js`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the round-trip Playwright test**

```js
test('admin asks for a document, agency replies with one', async ({ browser }) => {
  const admin = await browser.newPage();
  await signInAs(admin, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
  await admin.goto('/admin-mp-agencies.html');
  await admin.click('.mp-ag-row:first-child');
  await admin.fill('#mp-drawer-subject', 'Trade licence needed');
  await admin.fill('#mp-drawer-body', 'Please upload your current trade licence.');
  await admin.click('#mp-drawer-compose button[type=submit]');
  await expect(admin.locator('#mp-drawer-msg')).toContainText('Sent');

  const agency = await browser.newPage();
  await signInAs(agency, process.env.E2E_AGENCY_EMAIL, process.env.E2E_AGENCY_PASSWORD);
  await agency.goto('/partners-messages.html');
  await expect(agency.locator('.mp-thread-item')).toContainText('Trade licence needed');
  await agency.click('.mp-thread-item');
  await agency.fill('#mp-reply-body', 'Attached.');
  await agency.setInputFiles('#mp-reply-files', 'tests/fixtures/licence.pdf');
  await agency.click('#mp-reply-form button[type=submit]');
  await expect(agency.locator('#mp-reply-msg')).toHaveText('Sent.');

  await admin.goto('/admin-mp-messages.html');
  await expect(admin.locator('.mp-thread-item')).toContainText('Trade licence needed');
  await admin.click('.mp-thread-item');
  await expect(admin.locator('.mp-att')).toContainText('licence.pdf');
});
```

- [ ] **Step 2: Run both gates**

```bash
npx playwright test --config=pw.partners.local.config.js
supabase db query --linked -f tests/rls/mp-messaging-isolation.sql
supabase db query --linked -f tests/rls/mp-isolation.sql
```
Expected: Playwright green; messaging gate 6/6 PASS; the **Chunk 1 gate still 12/12 PASS** — this plan must not regress it.

- [ ] **Step 3: Production smoke, then clean up completely**

Register a throwaway agency → admin sends a request from the drawer → confirm the email arrives and the notification row exists → agency replies with a file → admin opens it via a signed URL. Then delete the auth user, agency, memberships, threads, messages, notifications, **and the storage objects**. Verify zero leftovers:

```bash
supabase db query --linked "
select 'threads' t, count(*) from globalhire.mp_threads where agency_id = '<throwaway>'
union all select 'messages', count(*) from globalhire.mp_messages m
  join globalhire.mp_threads th on th.id=m.thread_id where th.agency_id='<throwaway>'
union all select 'notifications', count(*) from globalhire.mp_notifications where agency_id='<throwaway>'
union all select 'objects', count(*) from storage.objects
  where name like 'marketplace/agency/<throwaway>/%';"
```
Expected: every count `0`.

- [ ] **Step 4: Grep production for leaked paths**

Per the repo's standing rule (authorial scanners only cover the fields they own):

```bash
supabase db query --linked "
select id, left(body_md, 80) from globalhire.mp_messages
 where body_md like '%/Users/%' or body_md like '%~/%'
    or attachments::text like '%/Users/%';"
```
Expected: zero rows.

- [ ] **Step 5: Commit and record progress**

```bash
git add tests/partners.spec.js docs/superpowers/plans/partner-marketplace-progress.md
git commit -m "test(partners): e2e document-request round trip; record S10 complete"
```

---

## Self-Review

**Spec coverage:** §2 tables → Task 1. §2 triggers/RPCs → Task 2. §3 tenancy/grants → Task 1, gated by Task 3. §4 attachments → Tasks 5, 6, 9. §5 partner surface → Task 10; admin surfaces → Tasks 11, 12; bell → Task 13. §6 edge functions → Tasks 4–7. §7 error handling → non-fatal email (Tasks 7, 14), fire-and-forget `pg_net` (Task 8), upload-failure abort (Task 9 `post`). §8 migration of existing behaviour → Task 14. §9 acceptance gates → Tasks 3 and 15. §11 exclusions → nothing in any task implements realtime, editing, AI drafting, or digests. **No gaps.**

**Type consistency:** `MPMsg.post(threadId, agencyId, body, files)` takes `agencyId` in Task 9 and is called with it in Tasks 10 and 11 ✓. `mp_mark_thread_read` takes only `p_thread_id` in Task 2 and is called that way in Task 9 ✓. `buildNotification` links to `partners-messages.html` / `admin-mp-messages.html`, both of which Tasks 10 and 11 create ✓. `validateCreateBody` returns `context_id: null` when absent, and `mp_create_thread_with_message` accepts a null `p_context_id` ✓.

**Known seam, deliberate:** Task 9 uploads attachments under a client-generated `m<timestamp>` seed rather than `message_id`, because the file must exist before the message row does. The path still sits under the agency prefix, which is what both storage RLS and `mp-thread-post`'s `attachmentsInsideAgency` check enforce — so the security property holds; only the folder name differs from the spec's illustrative `<message_id>`.
