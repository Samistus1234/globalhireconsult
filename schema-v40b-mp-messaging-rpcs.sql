-- schema-v40b-mp-messaging-rpcs.sql
-- Unread maintenance + the only write paths into mp_threads / mp_messages.
-- Spec: docs/superpowers/specs/2026-09-12-partner-messaging-design.md
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

-- PostgREST only exposes the `public` schema, so a browser RPC call to
-- `mp_mark_thread_read` needs a thin public wrapper. SECURITY INVOKER: the
-- inner globalhire function is already SECURITY DEFINER and does its own
-- authorisation, so the wrapper does not need (and must not add) definer rights.
CREATE OR REPLACE FUNCTION public.mp_mark_thread_read(p_thread_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT globalhire.mp_mark_thread_read(p_thread_id);
$$;
REVOKE ALL ON FUNCTION public.mp_mark_thread_read(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mp_mark_thread_read(uuid) TO authenticated;

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
