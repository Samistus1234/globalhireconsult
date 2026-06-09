-- schema-v16-interest-notify.sql
-- Email the team the moment a registered applicant marks a matched opportunity
-- "interested". Fires for BOTH response paths (both UPDATE campaign_matches.response):
--   - in-portal "Interested" button (direct UPDATE via campaign_matches_write view)
--   - email-link response (respond_via_token RPC)
-- Calls the notify-interest edge fn via pg_net (fire-and-forget). Sends shared
-- secret header x-internal-secret so the endpoint can't be invoked with the public
-- anon key alone. Recipient is fixed server-side in the edge fn (INTEREST_NOTIFY_TO).
--
-- DEPLOYED LIVE 2026-06-09 with the real secret. Before re-running this file,
-- replace <INTERNAL_TRIGGER_SECRET> below with the value stored in the Supabase
-- function secret of the same name (do NOT commit the real secret).
-- Run in the Supabase SQL editor for project evzhnsugmvtqgmvzwyix.

CREATE OR REPLACE FUNCTION globalhire.notify_interest_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.response = 'interested' AND (OLD.response IS DISTINCT FROM 'interested') THEN
    PERFORM net.http_post(
      url     := 'https://evzhnsugmvtqgmvzwyix.supabase.co/functions/v1/notify-interest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2emhuc3VnbXZ0cWdtdnp3eWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTcyNzcsImV4cCI6MjA4NzEzMzI3N30.JSjwHLHudUWlgXkaAam8xxXQbpCmbOLcBGenkFW3qNk',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2emhuc3VnbXZ0cWdtdnp3eWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTcyNzcsImV4cCI6MjA4NzEzMzI3N30.JSjwHLHudUWlgXkaAam8xxXQbpCmbOLcBGenkFW3qNk',
        'x-internal-secret', '<INTERNAL_TRIGGER_SECRET>'
      ),
      body    := jsonb_build_object('match_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_interest ON globalhire.campaign_matches;
CREATE TRIGGER trg_notify_interest
  AFTER UPDATE OF response ON globalhire.campaign_matches
  FOR EACH ROW
  EXECUTE FUNCTION globalhire.notify_interest_response();
