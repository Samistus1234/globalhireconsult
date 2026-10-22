-- v47_profile_reminder_exclude_internal
-- GlobalHire (project evzhnsugmvtqgmvzwyix) -- PRODUCTION
--
-- Follow-up to v46. The pre-launch review of the 68 people v46 would have emailed
-- found 12 internal/test accounts among them (App Store reviewer login,
-- headoffice@, partner@, and @globalhire-test.com / @elab.test fixtures). They
-- must never get a reminder.
--
--   1. profile_reminder_candidates() now excludes staff/test/example addresses
--      and anyone without a login email (previously those became 'failed' rows).
--   2. Aligns stored profile_completed with the portal's own rule (specialty +
--      country + phone) for applicants who already have all three but a stale
--      false flag. 50 rows at time of writing. Only ever flips false -> true.
--
-- Does NOT touch the switch: profile_reminders stays exactly as it is.

begin;

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
             case when p.specialty         is null or btrim(p.specialty)         = '' then 'specialty' end,
             case when p.country_of_origin is null or btrim(p.country_of_origin) = '' then 'country'   end,
             case when p.phone             is null or btrim(p.phone)             = '' then 'phone'     end
           ], null) as missing,
           exists (select 1 from globalhire.documents d where d.applicant_id = p.id) as has_docs
    from globalhire.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'applicant'
      and p.pipeline_exit_status is null
      and p.pipeline_stage in ('application_received', 'screening')
      and coalesce(p.profile_completed, false) = false
      and p.created_at <= now() - interval '24 hours'
      and u.email is not null
      -- never email staff, store-review, partner-demo or test fixtures
      and u.email !~* '@(elabsolution\.org|elab\.test|globalhire-test\.com|globalhireconsult\.com|example\.(com|org|net))$'
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

-- stale completeness flag (false -> true only, only when all three fields exist)
update globalhire.profiles
set profile_completed = true
where role = 'applicant'
  and coalesce(profile_completed, false) = false
  and btrim(coalesce(specialty, '')) <> ''
  and btrim(coalesce(country_of_origin, '')) <> ''
  and btrim(coalesce(phone, '')) <> '';

commit;
