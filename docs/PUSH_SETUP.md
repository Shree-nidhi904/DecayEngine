# Web Push setup (optional)

Notifications while the app is closed. The server only knows *when* to nudge a
person, never who or what it is about: the device computes the time from its own
data and uploads that plus a generic sentence. At most one push a day per app,
and never between 22:00 and 08:00 local time (applied on the device).

Needs the sync setup first (`supabase/migrations/20261128000000_sync.sql`, sign-in).

## One-time setup

1. **Keys.** `npx web-push generate-vapid-keys --json`.
   - Public key: `VITE_VAPID_PUBLIC_KEY=...` in each `apps/*/.env.local` and in the Netlify sites.
   - Private key: only as a Supabase secret (below). Never in the repo or the page.
2. **Secrets.**
   ```bash
   npx supabase secrets set \
     VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." \
     VAPID_SUBJECT="mailto:you@example.com" CRON_SECRET="$(openssl rand -hex 32)"
   ```
   `CRON_SECRET` is **not** a `VITE_` variable and does not go in any `.env` file for the apps.
   The web app never needs it; only the Edge Function and the cron job do.
3. **Extensions.** Dashboard > Database > Extensions: enable `pg_cron` and `pg_net`.
4. **Tables and functions.** Run `supabase/migrations/20261128000100_push.sql` in the SQL editor.
5. **Deploy the function.**
   ```bash
   npx supabase functions deploy send-due-pushes --no-verify-jwt
   ```
6. **Schedule it.** Run `supabase/cron/schedule-push.sql` in the SQL editor, with your `CRON_SECRET` in place of the placeholder.

## Try it without waiting for anything to decay

Use a production build (the service worker is registered only there) on `localhost`:

```bash
pnpm --filter @decay-engine/ghosted build
pnpm --filter @decay-engine/ghosted exec vite preview --port 4173
```

1. Open `http://localhost:4173`, sign in under "Sync across devices", then under
   "Notify me even when this tab is closed" press **Turn on** and allow notifications.
2. Close the tab (or switch to another one: a push is not shown while the app is on screen).
3. In the SQL editor, make a push due now:
   ```sql
   update public.push_schedule set notify_at = now() where app = 'ghosted';
   ```
4. Within a minute the notification should appear. Clicking it brings the app forward.

## If nothing arrives

- `select * from cron.job_run_details order by start_time desc limit 5;`: did the job run?
- `select * from net._http_response order by created desc limit 5;`: what did the function answer?
  `401` means the Vault secret and `CRON_SECRET` differ.
- Dashboard > Edge Functions > send-due-pushes > Logs.
- `select app, notify_at, last_sent_at from public.push_schedule;`: a `last_sent_at`
  less than 24 hours ago holds the next push back (that is the daily limit).
- `select app, left(endpoint, 40) from public.push_subscriptions;`: is this browser registered?
- Browser: site settings must allow notifications; some systems silence them in focus or do-not-disturb modes.

## Limits

- Delivery can be up to about a minute late (the job runs once a minute).
- iPhone: only for an app added to the Home Screen, iOS 16.4 or later.
- After one push is sent, the next is scheduled only when the app is opened or syncs again,
  so a person who never returns is not nagged.
