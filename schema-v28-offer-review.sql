-- ============================================
-- GLOBALHIRE@ELAB — Schema v28
-- Candidate Offer Review (Accept / Decline)
-- ============================================
--
-- Live offer_extended email promises candidates "Review the offer details in
-- your portal". This migration builds the surface that promise points to:
--   1. offer_summary text on placements (recruiter-entered offer terms)
--   2. a trusted-write escape on the v25 column guard so the respond_offer
--      RPC (SECURITY DEFINER, caller = applicant) may move pipeline_stage /
--      pipeline_exit_* on the applicant's own profile
--   3. explicit-list recreation of gh_placements + gh_my_placements so
--      offer_summary surfaces without the CREATE OR REPLACE positional-rename
--      error (42P16) that a p.* re-expansion would trigger
--   4. INSTEAD OF triggers on public.gh_placements — the joined view is not
--      auto-updatable, so the admin placements module has never been able to
--      write; these route INSERT/UPDATE/DELETE to the base table (strict
--      is_admin() gate — never allow auth.uid() IS NULL: anon holds GRANT ALL
--      on the view and has a null uid)
--   5. respond_offer(uuid,text,text) — SECURITY DEFINER RPC. Accept auto-
--      advances pipeline_stage -> offer_accepted (v26 stage-change email
--      fires), decline writes pipeline_exit_status='declined' + notifies the
--      team via an inbound globalhire.messages row.
--
-- Storage note: the applicant read policy for gh-placement-contracts ALREADY
-- exists (schema-v6.sql:338) — offer-letter PDFs are read via signed URLs
-- without any new storage policy.

begin;

-- ══════════════════════════════════════════════
-- 1. offer_summary column on placements
-- ══════════════════════════════════════════════
alter table globalhire.placements add column if not exists offer_summary text;

-- ══════════════════════════════════════════════
-- 2. Column-guard trusted-write escape
--    (reproduced from schema-v25-pipeline.sql verbatim + one OR condition)
-- ══════════════════════════════════════════════
create or replace function globalhire.gh_profiles_column_guard()
returns trigger
language plpgsql
set search_path = globalhire, pg_catalog
as $$
begin
  if globalhire.is_admin() or auth.uid() is null
     or current_setting('gh.trusted_write', true) = 'on' then
    return new;  -- admin user, trusted backend/service_role, or an RPC we authored
  end if;

  if new.role                       is distinct from old.role
  or new.recruiter_approved         is distinct from old.recruiter_approved
  or new.pipeline_stage             is distinct from old.pipeline_stage
  or new.pipeline_exit_status       is distinct from old.pipeline_exit_status
  or new.pipeline_exit_reason       is distinct from old.pipeline_exit_reason
  or new.pipeline_exited_at         is distinct from old.pipeline_exited_at
  or new.placement_fee              is distinct from old.placement_fee
  or new.fee_currency               is distinct from old.fee_currency
  or new.invoice_number             is distinct from old.invoice_number
  or new.invoiced_at                is distinct from old.invoiced_at
  or new.paid_at                    is distinct from old.paid_at
  or new.migration_status           is distinct from old.migration_status
  or new.current_stage              is distinct from old.current_stage
  or new.dataflow_completed         is distinct from old.dataflow_completed
  or new.dataflow_number            is distinct from old.dataflow_number
  or new.dataflow_country           is distinct from old.dataflow_country
  or new.dataflow_via_elab          is distinct from old.dataflow_via_elab
  or new.allow_direct_marketing     is distinct from old.allow_direct_marketing then
    raise exception 'Only admins may modify protected profile columns'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ══════════════════════════════════════════════
-- 3. Recreate views with EXPLICIT column lists, offer_summary at the END.
--    (CREATE OR REPLACE matches columns positionally; p.* would re-expand
--     before the joined columns and error 42P16 on "cannot change name of
--     view column".)
-- ══════════════════════════════════════════════
create or replace view public.gh_placements as
select
  p.id,
  p.match_id,
  p.applicant_id,
  p.campaign_id,
  p.stage,
  p.visa_status,
  p.visa_type,
  p.visa_application_date,
  p.visa_approval_date,
  p.visa_notes,
  p.contract_status,
  p.contract_sent_at,
  p.contract_signed_at,
  p.start_date,
  p.end_date,
  p.expected_duration_months,
  p.termination_reason,
  p.termination_notes,
  p.terminated_at,
  p.destination_country,
  p.employer_name,
  p.position_title,
  p.salary_display,
  p.notes,
  p.created_by,
  p.created_at,
  p.updated_at,
  pr.full_name AS applicant_name,
  pr.avatar_initials,
  pr.avatar_color_index,
  cm.match_score,
  c.title AS campaign_title,
  pr.placement_fee,
  pr.fee_currency,
  pr.invoice_number,
  pr.invoiced_at,
  pr.paid_at,
  p.offer_summary
from globalhire.placements p
left join globalhire.profiles pr on pr.id = p.applicant_id
left join globalhire.campaign_matches cm on cm.id = p.match_id
left join globalhire.campaigns c on c.id = p.campaign_id
where globalhire.is_admin();

alter view public.gh_placements set (security_invoker = true);

create or replace view public.gh_my_placements as
select
  p.id,
  p.match_id,
  p.applicant_id,
  p.campaign_id,
  p.stage,
  p.visa_status,
  p.visa_type,
  p.contract_status,
  p.start_date,
  p.end_date,
  p.destination_country,
  p.employer_name,
  p.position_title,
  p.salary_display,
  p.created_at,
  p.updated_at,
  c.title AS campaign_title,
  p.offer_summary
from globalhire.placements p
left join globalhire.campaigns c on c.id = p.campaign_id;

alter view public.gh_my_placements set (security_invoker = true);

-- ══════════════════════════════════════════════
-- 4. INSTEAD OF triggers on public.gh_placements
--    (make the joined view writable for the admin placements module)
-- ══════════════════════════════════════════════
create or replace function globalhire.gh_placements_io_insert()
returns trigger
language plpgsql
security definer
set search_path = globalhire, pg_catalog
as $$
begin
  if not globalhire.is_admin() then
    raise exception 'Only admins may write placements' using errcode = '42501';
  end if;
  insert into globalhire.placements (
    match_id, applicant_id, campaign_id, stage, visa_status, visa_type,
    visa_application_date, visa_approval_date, visa_notes, contract_status,
    contract_sent_at, contract_signed_at, start_date, end_date,
    expected_duration_months, termination_reason, termination_notes, terminated_at,
    destination_country, employer_name, position_title, salary_display,
    notes, offer_summary, created_by
  ) values (
    new.match_id, new.applicant_id, new.campaign_id,
    coalesce(new.stage, 'offer_extended'), coalesce(new.visa_status, 'not_started'), new.visa_type,
    new.visa_application_date, new.visa_approval_date, new.visa_notes,
    coalesce(new.contract_status, 'not_started'), new.contract_sent_at, new.contract_signed_at,
    new.start_date, new.end_date, new.expected_duration_months,
    new.termination_reason, new.termination_notes, new.terminated_at,
    new.destination_country, new.employer_name, new.position_title, new.salary_display,
    new.notes, new.offer_summary, new.created_by
  )
  returning id into new.id;
  return new;
end;
$$;

create or replace function globalhire.gh_placements_io_update()
returns trigger
language plpgsql
security definer
set search_path = globalhire, pg_catalog
as $$
begin
  if not globalhire.is_admin() then
    raise exception 'Only admins may write placements' using errcode = '42501';
  end if;
  update globalhire.placements set
    match_id = new.match_id,
    applicant_id = new.applicant_id,
    campaign_id = new.campaign_id,
    stage = new.stage,
    visa_status = new.visa_status,
    visa_type = new.visa_type,
    visa_application_date = new.visa_application_date,
    visa_approval_date = new.visa_approval_date,
    visa_notes = new.visa_notes,
    contract_status = new.contract_status,
    contract_sent_at = new.contract_sent_at,
    contract_signed_at = new.contract_signed_at,
    start_date = new.start_date,
    end_date = new.end_date,
    expected_duration_months = new.expected_duration_months,
    termination_reason = new.termination_reason,
    termination_notes = new.termination_notes,
    terminated_at = new.terminated_at,
    destination_country = new.destination_country,
    employer_name = new.employer_name,
    position_title = new.position_title,
    salary_display = new.salary_display,
    notes = new.notes,
    offer_summary = new.offer_summary,
    created_by = new.created_by,
    updated_at = coalesce(new.updated_at, now())
  where id = old.id;
  return new;
end;
$$;

create or replace function globalhire.gh_placements_io_delete()
returns trigger
language plpgsql
security definer
set search_path = globalhire, pg_catalog
as $$
begin
  if not globalhire.is_admin() then
    raise exception 'Only admins may write placements' using errcode = '42501';
  end if;
  delete from globalhire.placements where id = old.id;
  return old;
end;
$$;

drop trigger if exists gh_placements_io_insert on public.gh_placements;
create trigger gh_placements_io_insert
  instead of insert on public.gh_placements
  for each row execute function globalhire.gh_placements_io_insert();

drop trigger if exists gh_placements_io_update on public.gh_placements;
create trigger gh_placements_io_update
  instead of update on public.gh_placements
  for each row execute function globalhire.gh_placements_io_update();

drop trigger if exists gh_placements_io_delete on public.gh_placements;
create trigger gh_placements_io_delete
  instead of delete on public.gh_placements
  for each row execute function globalhire.gh_placements_io_delete();

-- ══════════════════════════════════════════════
-- 5. respond_offer RPC — the applicant's accept/decline write path.
--    SECURITY DEFINER (postgres owner bypasses RLS), validates ownership
--    before any write, and flips pipeline_stage through the column guard via
--    the transaction-scoped gh.trusted_write GUC (PostgREST callers cannot
--    run arbitrary SET, so applicants still cannot self-edit via REST).
-- ══════════════════════════════════════════════
create or replace function globalhire.respond_offer(
  p_match_id uuid,
  p_decision text,
  p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = globalhire, pg_catalog
as $$
declare
  v_match   globalhire.campaign_matches%rowtype;
  v_camp    globalhire.campaigns%rowtype;
  v_appl    globalhire.profiles%rowtype;
  v_place   globalhire.placements%rowtype;
  v_old_stage text;
begin
  if p_decision not in ('accept', 'decline') then
    return jsonb_build_object('success', false, 'error', 'Invalid decision');
  end if;

  select * into v_match from globalhire.campaign_matches where id = p_match_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Match not found');
  end if;

  -- Caller must own the match (or be an admin).
  if v_match.applicant_id is distinct from auth.uid() and not globalhire.is_admin() then
    return jsonb_build_object('success', false, 'error', 'Not authorized');
  end if;

  select * into v_appl from globalhire.profiles where id = v_match.applicant_id;
  if not found or v_appl.pipeline_exit_status is not null then
    return jsonb_build_object('success', false, 'error', 'Offer already closed');
  end if;

  select * into v_camp from globalhire.campaigns where id = v_match.campaign_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Campaign not found');
  end if;

  select * into v_place from globalhire.placements where match_id = p_match_id;
  v_old_stage := v_place.stage;

  if p_decision = 'accept' then
    -- Idempotent: already accepted.
    if v_appl.pipeline_stage = 'offer_accepted'
       and v_place.id is not null and v_place.stage = 'offer_accepted' then
      return jsonb_build_object('success', true, 'decision', 'accept', 'already', true, 'placement_id', v_place.id);
    end if;
    if v_appl.pipeline_stage not in ('offer_extended', 'offer_accepted') then
      return jsonb_build_object('success', false, 'error', 'Offer already processed');
    end if;

    if v_place.id is null then
      insert into globalhire.placements
        (match_id, applicant_id, campaign_id, stage,
         destination_country, employer_name, position_title, salary_display, created_by)
      values
        (v_match.id, v_match.applicant_id, v_match.campaign_id, 'offer_accepted',
         v_camp.destination_country, v_camp.employer_name, v_camp.title, v_camp.salary_display, auth.uid())
      returning * into v_place;
    else
      update globalhire.placements
         set stage = 'offer_accepted', updated_at = now()
       where id = v_place.id;
    end if;

    perform set_config('gh.trusted_write', 'on', true);
    update globalhire.profiles
       set pipeline_stage = 'offer_accepted', updated_at = now()
     where id = v_match.applicant_id;

    insert into globalhire.placement_activities
      (placement_id, event_type, old_value, new_value, details, actor_id)
    values
      (v_place.id, 'stage_changed', v_old_stage, 'offer_accepted',
       jsonb_build_object('source', 'candidate_portal', 'match_id', v_match.id, 'campaign_id', v_match.campaign_id),
       auth.uid());

    return jsonb_build_object('success', true, 'decision', 'accept', 'placement_id', v_place.id, 'stage', 'offer_accepted');
  else
    if v_appl.pipeline_stage <> 'offer_extended' then
      return jsonb_build_object('success', false, 'error', 'Offer already processed');
    end if;

    if v_place.id is null then
      insert into globalhire.placements
        (match_id, applicant_id, campaign_id, stage,
         destination_country, employer_name, position_title, salary_display,
         created_by, termination_reason, terminated_at)
      values
        (v_match.id, v_match.applicant_id, v_match.campaign_id, 'terminated',
         v_camp.destination_country, v_camp.employer_name, v_camp.title, v_camp.salary_display,
         auth.uid(), coalesce('Declined offer: ' || p_reason, 'Declined offer'), now())
      returning * into v_place;
    else
      update globalhire.placements
         set stage = 'terminated',
             termination_reason = coalesce('Declined offer: ' || p_reason, v_place.termination_reason),
             terminated_at = now(),
             updated_at = now()
       where id = v_place.id;
    end if;

    insert into globalhire.placement_activities
      (placement_id, event_type, old_value, new_value, details, actor_id)
    values
      (v_place.id, 'terminated', v_old_stage, 'terminated',
       jsonb_build_object('source', 'candidate_portal', 'reason', p_reason),
       auth.uid());

    perform set_config('gh.trusted_write', 'on', true);
    update globalhire.profiles
       set pipeline_exit_status = 'declined',
           pipeline_exit_reason = coalesce(p_reason, 'Declined the offer'),
           pipeline_exited_at = now(),
           updated_at = now()
     where id = v_match.applicant_id;

    insert into globalhire.messages (applicant_id, direction, subject, body, sent_at)
    values (v_match.applicant_id, 'inbound', 'Offer Declined',
            'Applicant ' || coalesce(v_appl.full_name, v_appl.id::text) ||
            ' declined the offer for "' || coalesce(v_camp.title, '') || '".' ||
            case when p_reason is not null then ' Reason: ' || p_reason else '' end,
            now());

    return jsonb_build_object('success', true, 'decision', 'decline', 'placement_id', v_place.id, 'stage', 'terminated');
  end if;
end;
$$;

revoke execute on function globalhire.respond_offer(uuid, text, text) from public;
grant execute on function globalhire.respond_offer(uuid, text, text) to authenticated;

-- ══════════════════════════════════════════════
-- 6. PostgREST exposure + campaigns read gap (verified live 2026-08-30)
--    a) RPCs in globalhire are NOT reachable via /rest/v1/rpc/* (this project
--       only exposes `public` to PostgREST — proven by respond_via_token
--       404ing). Thin public wrapper so the portal can call sb.rpc().
--    b) gh_my_opportunities JOINs globalhire.campaigns under security_invoker,
--       but applicants had NO SELECT policy on campaigns → LEFT JOIN yields
--       NULL campaign cols → the WHERE c.status IN (...) filter dropped every
--       row → the portal Opportunities tab was empty for all applicants.
--       Fix = a tightly-scoped applicant policy (only campaigns the caller is
--       matched to — not a broad leak).
-- ══════════════════════════════════════════════
create or replace function public.respond_offer(
  p_match_id uuid,
  p_decision text,
  p_reason text default null)
returns jsonb
language sql
security definer
set search_path = globalhire, pg_catalog
as $$
  select globalhire.respond_offer(p_match_id, p_decision, p_reason);
$$;

revoke execute on function public.respond_offer(uuid, text, text) from public;
grant execute on function public.respond_offer(uuid, text, text) to authenticated;

create policy gh_applicants_read_matched_campaigns
  on globalhire.campaigns
  for select
  to authenticated
  using (
    exists (
      select 1
      from globalhire.campaign_matches cm
      where cm.campaign_id = campaigns.id
        and cm.applicant_id = auth.uid()
    )
  );

commit;
