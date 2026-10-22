-- v46_profile_reminders
-- GlobalHire (project evzhnsugmvtqgmvzwyix) -- PRODUCTION
--
-- Asks applicants whose profile is incomplete to finish it, by branded email
-- (edge function profile-reminder, sent as "GlobalHire@eLab" from the support
-- mailbox, same shell as the stage emails).
--
-- "Incomplete" = the portal's own definition: specialty OR country_of_origin OR
-- phone missing (js/portal.js sets profile_completed from exactly these three).
--
-- Rules (all enforced here, in SQL, not in the function):
--   * stages application_received / screening only; never exited applicants
--   * only 24h after sign-up, so nobody is emailed mid-form or right after the
--     welcome email
--   * one first note, then ONE follow-up after 5 days if still incomplete, then
--     nothing more, ever
--   * a person with 3 failed sends is left alone
--   * firsts are served before follow-ups; the function caps each run at 20
--
-- Ships DISABLED (automation_flags.profile_reminders = false). Nothing is sent
-- until an admin turns it on, and the dry run (profile-reminder with
-- {"dry_run":true}) shows exactly who would get what first.
--
-- The scheduler wrapper needs the internal trigger secret. Like the existing
-- trigger, it is read from the LIVE notify_pipeline_stage_change() definition
-- at install time, so the secret never appears in this repo.

begin;

-- 1. switch (off) ------------------------------------------------------------------
insert into globalhire.automation_flags (key, enabled)
values ('profile_reminders', false)
on conflict (key) do nothing;

-- 2. send log ----------------------------------------------------------------------
create table if not exists globalhire.profile_reminders (
  id           bigserial primary key,
  applicant_id uuid not null references globalhire.profiles(id) on delete cascade,
  kind         text not null check (kind in ('first', 'followup')),
  missing      text[] not null default '{}',
  status       text not null check (status in ('sent', 'failed')),
  error        text,
  sent_at      timestamptz not null default now()
);
create index if not exists profile_reminders_applicant_idx
  on globalhire.profile_reminders (applicant_id, sent_at desc);
alter table globalhire.profile_reminders enable row level security;

drop policy if exists profile_reminders_admin_read on globalhire.profile_reminders;
create policy profile_reminders_admin_read on globalhire.profile_reminders
  for select using (globalhire.is_admin());

-- 3. who gets which email ----------------------------------------------------------
create or replace function globalhire.profile_reminder_candidates(
  p_limit         int default 20,
  p_followup_days int default 5
) returns table (
  applicant_id uuid,
  kind         text,
  missing      text[],
  has_docs     boolean,
  full_name    text
)
language sql
stable
security definer
set search_path to 'globalhire', 'pg_catalog'
as $fn$
  with base as (
    select p.id, p.full_name, p.created_at,
           array_remove(array[
             case when p.specialty        is null or btrim(p.specialty)        = '' then 'specialty' end,
             case when p.country_of_origin is null or btrim(p.country_of_origin) = '' then 'country'   end,
             case when p.phone            is null or btrim(p.phone)            = '' then 'phone'     end
           ], null) as missing,
           exists (select 1 from globalhire.documents d where d.applicant_id = p.id) as has_docs
    from globalhire.profiles p
    where p.role = 'applicant'
      and p.pipeline_exit_status is null
      and p.pipeline_stage in ('application_received', 'screening')
      and coalesce(p.profile_completed, false) = false
      and p.created_at <= now() - interval '24 hours'
  ),
  hist as (
    select r.applicant_id,
           count(*) filter (where r.status = 'sent')   as sent_n,
           count(*) filter (where r.status = 'failed') as failed_n,
           max(r.sent_at) filter (where r.status = 'sent') as last_sent
    from globalhire.profile_reminders r
    group by r.applicant_id
  )
  select b.id,
         case when coalesce(h.sent_n, 0) = 0 then 'first' else 'followup' end,
         b.missing,
         b.has_docs,
         b.full_name
  from base b
  left join hist h on h.applicant_id = b.id
  where cardinality(b.missing) > 0
    and coalesce(h.failed_n, 0) < 3
    and (
      coalesce(h.sent_n, 0) = 0
      or (h.sent_n = 1 and h.last_sent <= now() - make_interval(days => p_followup_days))
    )
  order by coalesce(h.sent_n, 0), b.created_at
  limit greatest(p_limit, 0);
$fn$;

revoke all on function globalhire.profile_reminder_candidates(int, int) from public, anon, authenticated;
grant execute on function globalhire.profile_reminder_candidates(int, int) to service_role;

-- 4. scheduler wrapper (secret read from the live trigger, never from the repo) -------
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
        body    := jsonb_build_object('limit', 20)
      );
    end
    $b$;
  $f$, v_secret);
end
$mk$;

revoke all on function globalhire.run_profile_reminders() from public, anon, authenticated;

-- 5. schedule: hourly, 06:00-19:00 UTC only (daytime in Nigeria and the Gulf) --------
select cron.unschedule('gh-profile-reminders')
where exists (select 1 from cron.job where jobname = 'gh-profile-reminders');

select cron.schedule(
  'gh-profile-reminders',
  '0 6-19 * * *',
  $$select globalhire.run_profile_reminders()$$
);

commit;
