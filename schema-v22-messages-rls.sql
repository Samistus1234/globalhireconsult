-- v22_messages_rls
-- Task R3 of GlobalHire RLS remediation.
--
-- globalhire.messages currently has RLS DISABLED with ZERO policies (415 rows of PII: subject/body
-- of applicant<->admin correspondence). The backing views public.gh_messages and public.gh_inbox
-- are non-security_invoker (postgres-owner bypass), so today ANY caller who can read through those
-- views bypasses RLS entirely regardless of view-level WHERE clauses.
--
-- Pre-check findings (see .superpowers/sdd/rls-remediation-map.md, .superpowers/sdd/task-r3-report.md):
--   - globalhire.messages columns: id, applicant_id (uuid, NOT NULL), direction, subject, body,
--     sent_at, sent_by_admin. Ownership modeled via applicant_id.
--   - gh_messages view definition already has its own WHERE clause
--     (applicant_id = auth.uid() OR admin-check via gh_profiles) -- this only works today by
--     coincidence of view SQL, not RLS.
--   - gh_inbox view definition has NO ownership filter at all (only `direction = 'inbound'`) --
--     today it returns ALL applicants' inbound messages to ANY caller who can read it. This is
--     the core exploit this migration closes: after security_invoker is set, gh_inbox will be
--     re-evaluated under the calling role's RLS grants, so a non-admin/non-owner caller will
--     get zero rows from it (correct: inbox is an admin-only widorb, applicants should never see
--     other applicants' inbound messages via this view).
--   - No client-side INSERT/UPDATE/DELETE call site found against messages/gh_messages/gh_inbox
--     (grepped js/*.js, *.html) -- all 7 call sites are .select() reads (candidates.js:91,526,
--     portal.js:1110, notifications.js:280,316, dashboard-live.js:276 via gh_inbox).
--   - Writes to globalhire.messages happen exclusively via edge functions (send-reply,
--     draft-message, gh-send-outreach, notify-applicant, bulk-campaign-notify,
--     notify-visa-status, send-consultation-message, analyze-document) using a
--     SUPABASE_SERVICE_ROLE_KEY client (confirmed in supabase/functions/send-reply/index.ts:38-40,
--     58) -- service_role bypasses RLS entirely, so no INSERT/UPDATE/DELETE policy is required for
--     anon/authenticated roles.

begin;

-- 1. Enable RLS on the base table (currently disabled).
alter table globalhire.messages enable row level security;

-- 2. Applicant can read only their own messages (both inbound and outbound).
create policy gh_applicants_read_own_messages
  on globalhire.messages
  for select
  to authenticated
  using (applicant_id = auth.uid());

-- 3. Admins can read all messages.
create policy gh_admins_read_all_messages
  on globalhire.messages
  for select
  to authenticated
  using (globalhire.is_admin());

-- 4. Flip the covering views to security_invoker so they honor RLS under the calling role,
--    instead of running as the postgres owner (bypass).
alter view public.gh_messages set (security_invoker = true);
alter view public.gh_inbox set (security_invoker = true);

-- No INSERT/UPDATE/DELETE policy is added for anon/authenticated: no client write path exists,
-- and service-role edge functions bypass RLS regardless of policies present.

commit;
