-- v48_profile_reminder_log_fix
-- GlobalHire (project evzhnsugmvtqgmvzwyix) -- PRODUCTION
--
-- Found by the 2-person canary on 2026-10-21 19:06 UTC: the function emailed two
-- applicants but its log INSERT was rejected with HTTP 403, because the service
-- role had no USAGE on the bigserial sequence of globalhire.profile_reminders.
-- supabase-js returns {error} instead of throwing and the function ignored it, so
-- the sends were unlogged -- and unlogged sends would repeat every hour.
--
--   1. grant the sequence privileges the insert needs
--   2. backfill the two canary sends so those people are never emailed again
--   3. run_profile_reminders(): give pg_net 120s instead of its 5s default
--      (a 20-email batch takes about a minute; the function does keep running
--      after the caller times out, but the cron run history should say "200")
--
-- The function itself is also changed (profile-reminder v3): it now writes the
-- log row BEFORE sending and refuses to send if that write fails.
--
-- Does NOT touch the switch.

begin;

grant usage, select on sequence globalhire.profile_reminders_id_seq to service_role;

insert into globalhire.profile_reminders (applicant_id, kind, missing, status, sent_at)
select m.applicant_id,
       'first',
       array_remove(array[
         case when p.specialty         is null or btrim(p.specialty)         = '' then 'specialty' end,
         case when p.country_of_origin is null or btrim(p.country_of_origin) = '' then 'country'   end,
         case when p.phone             is null or btrim(p.phone)             = '' then 'phone'     end
       ], null),
       'sent',
       m.sent_at
from globalhire.messages m
join globalhire.profiles p on p.id = m.applicant_id
where m.direction = 'outbound'
  and m.subject = 'One quick step to complete your GlobalHire profile'
  and not exists (
    select 1 from globalhire.profile_reminders r
    where r.applicant_id = m.applicant_id and r.status = 'sent'
  );

do $mk$
declare
  v_secret text;
begin
  select substring(
           pg_get_functiondef('globalhire.notify_pipeline_stage_change()'::regprocedure)
           from 'x-internal-secret'',\s*''([0-9a-f]+)'''
         ) into v_secret;
  if v_secret is null then
    raise exception 'could not read the internal secret from notify_pipeline_stage_change(); aborting';
  end if;

  execute format($f$
    create or replace function globalhire.run_profile_reminders() returns void
    language plpgsql security definer
    set search_path to 'globalhire', 'pg_catalog'
    as $b$
    begin
      if not coalesce((select enabled from globalhire.automation_flags where key = 'profile_reminders'), false) then
        return;  -- switched off
      end if;
      perform net.http_post(
        url     := 'https://evzhnsugmvtqgmvzwyix.supabase.co/functions/v1/profile-reminder',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', %L),
        body    := jsonb_build_object('limit', 20),
        timeout_milliseconds := 120000
      );
    end
    $b$;
  $f$, v_secret);
end
$mk$;

revoke all on function globalhire.run_profile_reminders() from public, anon, authenticated;

commit;
