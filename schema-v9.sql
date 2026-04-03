-- schema-v9.sql — Recruiter inactivity tracking + 48hr reminder cron
-- Run this in the Supabase SQL editor for project evzhnsugmvtqgmvzwyix

-- Add activity tracking to recruiter_assignments
ALTER TABLE globalhire.recruiter_assignments
  ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Trigger: update last_action_at when recruiter adds a note
CREATE OR REPLACE FUNCTION globalhire.update_recruiter_last_action()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE globalhire.recruiter_assignments
  SET last_action_at = now()
  WHERE recruiter_id = NEW.recruiter_id
    AND applicant_id = NEW.applicant_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recruiter_note_action ON globalhire.recruiter_notes;
CREATE TRIGGER trg_recruiter_note_action
  AFTER INSERT ON globalhire.recruiter_notes
  FOR EACH ROW
  EXECUTE FUNCTION globalhire.update_recruiter_last_action();

-- Cron job: check every 12 hours for stale assignments
-- (already created via API, documented here for reference)
-- SELECT cron.schedule(
--   'check-recruiter-inactivity',
--   '0 */12 * * *',
--   $$SELECT net.http_post(
--     url := 'https://evzhnsugmvtqgmvzwyix.supabase.co/functions/v1/check-recruiter-inactivity',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', '<ANON_KEY>'),
--     body := '{}'::jsonb
--   ) AS request_id;$$
-- );
