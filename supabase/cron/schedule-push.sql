-- Runs send-due-pushes every minute. A TEMPLATE, not a migration: it needs your
-- CRON_SECRET, so run it by hand in the Supabase SQL editor and do not commit
-- the secret. Needs the pg_cron and pg_net extensions (Database > Extensions).

-- 1. Keep the secret in Supabase Vault, once. Replace the placeholder with the
--    same value you gave `npx supabase secrets set CRON_SECRET=...`.
select vault.create_secret('PASTE_YOUR_CRON_SECRET_HERE', 'push_cron_secret');

-- 2. Schedule the call, once.
select cron.schedule(
  'send-due-pushes',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://lzdckrmijjyciptjfglh.supabase.co/functions/v1/send-due-pushes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To stop it:   select cron.unschedule('send-due-pushes');
-- To change the secret later: update the Vault entry in Dashboard > Project Settings > Vault,
-- and run `npx supabase secrets set CRON_SECRET=...` with the same new value.
