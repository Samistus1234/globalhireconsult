-- schema-v26-stage-emails.sql
-- Automated candidate emails on pipeline stage change (16-stage master pipeline).
-- Fires for EVERY write path to profiles.pipeline_stage (stage select dropdown,
-- revenue shortcuts, future API/bulk writes) and lets the edge fn decide per
-- stage whether to email (STAGE_TEMPLATES map in stage-change-notify = the toggle;
-- stages absent from it never email). Silent by design: lead stages, screening,
-- revenue stages, and candidate exits (exits only write pipeline_exit_* columns,
-- never pipeline_stage, so the trigger never sees them — those stay manual).
--
-- Calls the stage-change-notify edge fn via pg_net (fire-and-forget). Sends the
-- shared secret header x-internal-secret so the endpoint can't be invoked with the
-- public anon key alone.
--
-- BEFORE re-running this file, replace <INTERNAL_TRIGGER_SECRET> below with the
-- value stored in the Supabase function secret of the same name (do NOT commit the
-- real secret).
-- Run in the Supabase SQL editor for project evzhnsugmvtqgmvzwyix.

CREATE OR REPLACE FUNCTION globalhire.notify_pipeline_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = globalhire, pg_catalog
AS $$
BEGIN
  IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
    PERFORM net.http_post(
      url     := 'https://evzhnsugmvtqgmvzwyix.supabase.co/functions/v1/stage-change-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2emhuc3VnbXZ0cWdtdnp3eWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTcyNzcsImV4cCI6MjA4NzEzMzI3N30.JSjwHLHudUWlgXkaAam8xxXQbpCmbOLcBGenkFW3qNk',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2emhuc3VnbXZ0cWdtdnp3eWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTcyNzcsImV4cCI6MjA4NzEzMzI3N30.JSjwHLHudUWlgXkaAam8xxXQbpCmbOLcBGenkFW3qNk',
        'x-internal-secret', '<INTERNAL_TRIGGER_SECRET>'
      ),
      body    := jsonb_build_object(
        'applicant_id', NEW.id,
        'old_stage',    OLD.pipeline_stage,
        'new_stage',    NEW.pipeline_stage,
        'triggered_by', auth.uid()
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_pipeline_stage ON globalhire.profiles;
CREATE TRIGGER trg_notify_pipeline_stage
  AFTER UPDATE OF pipeline_stage ON globalhire.profiles
  FOR EACH ROW
  WHEN (NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage)
  EXECUTE FUNCTION globalhire.notify_pipeline_stage_change();
