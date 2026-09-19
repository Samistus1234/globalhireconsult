-- schema-v41-mp-notify-trigger.sql
-- Fan-out: mp_messages insert -> pg_net -> mp-notify.
-- Mirrors schema-v16-interest-notify.sql. Substitute <INTERNAL_TRIGGER_SECRET> at apply
-- time; the literal placeholder is what stays in git.
-- PREREQ: `supabase functions deploy mp-notify` has already run (Task 7, live).
--
-- All four headers are required. net.http_post hits the Supabase platform gateway
-- first, and the gateway rejects any call with no apikey/Authorization BEFORE
-- mp-notify's own x-internal-secret check ever runs. pg_net is fire-and-forget, so a
-- missing apikey/Authorization pair does not error anywhere -- messages would insert,
-- the trigger would fire, and notifications would silently never arrive. The anon JWT
-- below is the project's public anon key (same literal already committed in
-- schema-v16-interest-notify.sql) -- not a secret. Run in the Supabase SQL editor /
-- via `supabase db query --linked -f` for project evzhnsugmvtqgmvzwyix.
BEGIN;

CREATE OR REPLACE FUNCTION globalhire.notify_mp_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://evzhnsugmvtqgmvzwyix.supabase.co/functions/v1/mp-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2emhuc3VnbXZ0cWdtdnp3eWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTcyNzcsImV4cCI6MjA4NzEzMzI3N30.JSjwHLHudUWlgXkaAam8xxXQbpCmbOLcBGenkFW3qNk',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2emhuc3VnbXZ0cWdtdnp3eWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTcyNzcsImV4cCI6MjA4NzEzMzI3N30.JSjwHLHudUWlgXkaAam8xxXQbpCmbOLcBGenkFW3qNk',
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
