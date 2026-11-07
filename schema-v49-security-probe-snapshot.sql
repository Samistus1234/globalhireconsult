-- GlobalHire (evzhnsugmvtqgmvzwyix)
-- Go-live (NOT applied). Read-only helper for the security-probe edge function. Service role only.
-- Returns admin emails (labels), a new-user COUNT (never sign-up emails), bucket names and
-- last-4 digits only; never full account numbers.
create or replace function public.security_probe_snapshot(p_since timestamptz)
returns jsonb
language sql
security definer
set search_path = public, auth, storage
as $$
  select jsonb_build_object(
    'admins', coalesce((select jsonb_agg(jsonb_build_object('id', u.id::text, 'email', coalesce(u.email, '(no email)')) order by u.id)
                        from (select distinct u.id, u.email from globalhire.profiles p join auth.users u on u.id = p.id
                              where p.role::text = 'admin') u), '[]'::jsonb),
    -- M3: a count only. No sign-up emails ever leave this project.
    'new_users_count', (select count(*) from auth.users where created_at > p_since)::int,
    'public_buckets', coalesce((select jsonb_agg(id order by id) from storage.buckets where public), '[]'::jsonb),
    'payment_rows',
      coalesce((select jsonb_agg(jsonb_build_object('table', 'bank_accounts', 'id', id::text, 'updated_at', updated_at,
                                 'account_number', right(coalesce(account_number::text, ''), 4)) order by id::text) from public.bank_accounts), '[]'::jsonb)
      || coalesce((select jsonb_agg(jsonb_build_object('table', 'partner_profiles', 'id', id::text, 'updated_at', updated_at,
                                 'account_number', right(coalesce(payout_account_number::text, ''), 4)) order by id::text)
                   from public.partner_profiles where payout_account_number is not null), '[]'::jsonb)
      || coalesce((select jsonb_agg(jsonb_build_object('table', 'referrers', 'id', id::text, 'updated_at', updated_at,
                                 'account_number', right(coalesce(account_number::text, ''), 4)) order by id::text)
                   from public.referrers where account_number is not null), '[]'::jsonb)
  );
$$;
revoke all on function public.security_probe_snapshot(timestamptz) from public, anon, authenticated;
grant execute on function public.security_probe_snapshot(timestamptz) to service_role;
