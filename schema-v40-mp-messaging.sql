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
