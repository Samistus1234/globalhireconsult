-- v50 (applied 2026-11-12): gh-visa-sync-push now refuses callers that aren't the server.
-- Callers: start-visa-case (Bearer service-role key) and the pg_cron job below
-- (x-sync-secret = vault secret gh_visa_sync_push_secret). The secret was generated
-- in the database and has never been printed:
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
--          'gh_visa_sync_push_secret', 'Shared secret: pg_cron job -> gh-visa-sync-push');

create or replace function globalhire.check_visa_sync_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(length(p_secret) >= 32 and exists (
    select 1 from vault.decrypted_secrets
    where name = 'gh_visa_sync_push_secret' and decrypted_secret = p_secret
  ), false);
$$;
revoke execute on function globalhire.check_visa_sync_secret(text) from public, anon, authenticated;
grant execute on function globalhire.check_visa_sync_secret(text) to service_role;

-- pg_cron job 'gh-visa-sync-push' (*/5) now sends the secret:
--   headers := jsonb_build_object('Content-Type','application/json','apikey',<anon key>,
--     'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets
--                       where name = 'gh_visa_sync_push_secret'))
