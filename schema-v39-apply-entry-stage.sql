-- v39_apply_entry_stage
-- GlobalHire (project evzhnsugmvtqgmvzwyix) -- PRODUCTION
--
-- Root-cause fix for "applicants who apply never enter the stored pipeline".
--
-- The v25 pipeline migration backfilled pipeline_stage = 'application_received'
-- for every profile that existed at migration time, but nothing stamps NEW
-- signups: profiles.pipeline_stage has no column default, and the applicant
-- apply flow (js/portal.js submitApplication) only inserts into
-- globalhire.campaign_applications — it never touches the profile stage.
-- Result: every applicant who signed up after v25 (110 profiles as of the fix,
-- incl. fresh applicants who applied to live campaigns such as EDOCHIE Chinelo
-- and Popoola Olalekan Muftau) has pipeline_stage = NULL in storage.
-- admin_applicant_overview derives a display fallback, so the UI looked fine,
-- but the stored column stayed NULL and pipeline automation (stage-change
-- notifications, stage-specific views/filters) never saw those candidates.
--
-- Fix:
--   1. Backfill stored NULL → 'application_received' for applicant rows
--      (the exact semantics v25 applied to null stages), excluding candidates
--      who exited so dead-ends are not resurrected into the active pipeline.
--   2. Default the column to 'application_received' so every future applicant
--      signup enters the 16-stage pipeline at the correct first stage.
--   3. The notify trigger is suppressed around the backfill so the ~110-row
--      UPDATE does not fire fire-and-forget pg_net calls (application_received
--      is silent in STAGE_TEMPLATES anyway; avoid the noise).
--
-- Idempotent: re-running only touches rows still NULL (none after first run).

begin;

alter table globalhire.profiles disable trigger trg_notify_pipeline_stage;

update globalhire.profiles
set pipeline_stage = 'application_received'
where role = 'applicant'
  and pipeline_stage is null
  and pipeline_exit_status is null;

alter table globalhire.profiles enable trigger trg_notify_pipeline_stage;

alter table globalhire.profiles
  alter column pipeline_stage set default 'application_received';

commit;
