-- v45_auto_advance_to_review
-- GlobalHire (project evzhnsugmvtqgmvzwyix) -- PRODUCTION
--
-- Moves applicants who have actually submitted an application from
-- 'application_received' into 'screening' (the review queue) without a human.
--
-- Today nothing does this: v39 made 'application_received' the entry stage, but
-- every move out of it was by hand. ~100 applicants with documents on file sit
-- there untouched.
--
-- DESIGN -- the hard requirement is that this can NEVER email anyone:
--   1. The move is silent by construction. trg_notify_pipeline_stage fires on ANY
--      pipeline_stage change and relies on the edge function to ignore stages it
--      has no template for. That is one STAGE_TEMPLATES entry away from mass-
--      emailing the backlog. So the notify trigger function now returns early
--      whenever the session flag gh.suppress_stage_notify = 'on', and the
--      auto-advance function sets that flag (transaction-local) around its UPDATE.
--      Manual admin moves are unaffected: they never set the flag.
--   2. Kill switch: globalhire.automation_flags.auto_advance_to_review. Ships
--      DISABLED. Nothing moves until an admin turns it on.
--   3. Rate cap: p_limit rows per run (default 25) on a 15-minute cron.
--   4. Narrow rule: role=applicant, stage exactly 'application_received', not
--      exited, at least one uploaded document, last upload >= 30 min ago (so a
--      multi-file upload is finished). Never touches any later stage.
--   5. Every move is logged in globalhire.pipeline_auto_advance_log.
--
-- The notify function embeds the internal trigger secret, so it is NOT redefined
-- from a copy in this file. The DO block below patches the live definition in
-- place (idempotent) and the secret never enters the repo.

begin;

-- 1. silence switch inside the notify trigger ------------------------------------
do $patch$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('globalhire.notify_pipeline_stage_change()'::regprocedure);
  if position('gh.suppress_stage_notify' in v_def) = 0 then
    v_def := replace(
      v_def,
      E'BEGIN\n  IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN',
      E'BEGIN\n  IF coalesce(current_setting(''gh.suppress_stage_notify'', true), '''') = ''on'' THEN\n    RETURN NEW;  -- automated, silent move (auto_advance_to_review)\n  END IF;\n  IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN'
    );
    if position('gh.suppress_stage_notify' in v_def) = 0 then
      raise exception 'notify_pipeline_stage_change() has an unexpected shape; patch not applied';
    end if;
    execute v_def;
  end if;
end
$patch$;

-- 2. kill switch -------------------------------------------------------------------
create table if not exists globalhire.automation_flags (
  key        text primary key,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table globalhire.automation_flags enable row level security;

drop policy if exists automation_flags_admin_all on globalhire.automation_flags;
create policy automation_flags_admin_all on globalhire.automation_flags
  for all using (globalhire.is_admin()) with check (globalhire.is_admin());

insert into globalhire.automation_flags (key, enabled)
values ('auto_advance_to_review', false)
on conflict (key) do nothing;

-- 3. audit log ---------------------------------------------------------------------
create table if not exists globalhire.pipeline_auto_advance_log (
  id           bigserial primary key,
  applicant_id uuid not null references globalhire.profiles(id) on delete cascade,
  from_stage   text not null,
  to_stage     text not null,
  reason       text not null,
  created_at   timestamptz not null default now()
);
create index if not exists pipeline_auto_advance_log_applicant_idx
  on globalhire.pipeline_auto_advance_log (applicant_id, created_at desc);
alter table globalhire.pipeline_auto_advance_log enable row level security;

drop policy if exists pipeline_auto_advance_log_admin_read on globalhire.pipeline_auto_advance_log;
create policy pipeline_auto_advance_log_admin_read on globalhire.pipeline_auto_advance_log
  for select using (globalhire.is_admin());

-- 4. the mover ---------------------------------------------------------------------
create or replace function globalhire.auto_advance_to_review(
  p_limit   int     default 25,
  p_dry_run boolean default false
) returns int
language plpgsql
security definer
set search_path to 'globalhire', 'pg_catalog'
as $fn$
declare
  v_enabled boolean;
  v_ids     uuid[];
  v_moved   int := 0;
begin
  select enabled into v_enabled
  from globalhire.automation_flags where key = 'auto_advance_to_review';

  if not p_dry_run and coalesce(v_enabled, false) is not true then
    return 0;  -- switched off
  end if;

  select coalesce(array_agg(id), '{}') into v_ids from (
    select p.id
    from globalhire.profiles p
    where p.role = 'applicant'
      and p.pipeline_stage = 'application_received'
      and p.pipeline_exit_status is null
      and exists (select 1 from globalhire.documents d where d.applicant_id = p.id)
      and (select max(d.uploaded_at) from globalhire.documents d where d.applicant_id = p.id)
            <= now() - interval '30 minutes'
    order by p.created_at
    limit greatest(p_limit, 0)
    for update of p skip locked
  ) q;

  if p_dry_run then
    return coalesce(array_length(v_ids, 1), 0);
  end if;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return 0;
  end if;

  -- transaction-local: tells trg_notify_pipeline_stage to stay silent
  perform set_config('gh.suppress_stage_notify', 'on', true);

  update globalhire.profiles
  set pipeline_stage = 'screening'
  where id = any (v_ids)
    and pipeline_stage = 'application_received';
  get diagnostics v_moved = row_count;

  insert into globalhire.pipeline_auto_advance_log (applicant_id, from_stage, to_stage, reason)
  select id, 'application_received', 'screening', 'documents submitted; auto-advanced to review'
  from unnest(v_ids) as id;

  perform set_config('gh.suppress_stage_notify', 'off', true);
  return v_moved;
end
$fn$;

revoke all on function globalhire.auto_advance_to_review(int, boolean) from public, anon, authenticated;

-- 5. schedule (harmless while the flag is off) ---------------------------------------
select cron.unschedule('gh-auto-advance-to-review')
where exists (select 1 from cron.job where jobname = 'gh-auto-advance-to-review');

select cron.schedule(
  'gh-auto-advance-to-review',
  '*/15 * * * *',
  $$select globalhire.auto_advance_to_review(25, false)$$
);

commit;
