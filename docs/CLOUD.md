# Cloud sync and notifications (optional)

Study Dungeon and Ghosted keep everything in your browser. This page is about the
**optional** extras: syncing across devices, notifications while the app is closed,
and Life Triage reading your saves from your account. **If you do nothing, none of it
runs and the apps make no network request.**

You bring your own [Supabase](https://supabase.com) project. Nothing is hosted for you,
and nothing is sent to anyone else.

## What each part does

| Part | What it does | What leaves your device |
|---|---|---|
| **Sync** | Keeps one save per app in your account; pulls it onto your other devices | The save (or, with a passphrase, scrambled text), your email address for sign-in |
| **Passphrase** | Encrypts the save on your device before it is sent | Only the encrypted text |
| **Notifications** | One nudge when something is about to change, even with the app closed | A time and one generic sentence ("A window on your street is about to change…"); your browser's push address |
| **Life Triage, "Load from my account"** | Reads both saves instead of two files | Your email address for sign-in. It only reads |
| **Clock check** | Warns if your device clock is minutes off the server's | Nothing |

## How it stays optional

- No settings in the build (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) means no Sync panel, and the code is never loaded.
- With settings, the sync code (`packages/cloud`, about 230 KB) is still loaded **only** when you open the Sync panel or return from a sign-in link. `scripts/check-bundles.mjs` fails the build if it ever lands in a main bundle.
- The apps' own source contains no network call; their existing `no-network` tests pass unchanged.

## Setting it up

1. Create a Supabase project. In the SQL Editor run, in order:
   `supabase/migrations/20261128000000_sync.sql`, `..._push.sql`, `..._server_time.sql`.
2. Authentication → URL Configuration: add each place the apps run as a Redirect URL
   (for example `http://localhost:4173/` and your site addresses).
3. Put the project URL and **publishable** key in `apps/<app>/.env.local` (see `.env.example`)
   and, for a deployed site, in the host's environment variables. Never a service-role key.
4. For notifications, follow [PUSH_SETUP.md](PUSH_SETUP.md).

## How sync behaves

- One row per person and app. You can read only your own (row-level security); writes go through a function that checks the revision you last saw, so two devices cannot overwrite each other.
- A device syncs when it opens, when the tab comes back into view, and every two minutes while open.
- **First sync, or both sides changed:** you choose *Keep this device*, *Keep the cloud copy* or *Merge both*. Merge keeps every item from both and the newer of two copies of the same item. It cannot tell "removed" from "missing", so something you deleted on one side comes back.
- If two copies hold identical data, nothing is pulled or pushed.
- **Reset all data** clears this device's sync note, so a signed-in device may pull its cloud copy back. **Delete my cloud data and account** is the real wipe; this device keeps its own data.

## Privacy, plainly

- Without a passphrase, the save is stored as readable JSON, so people and facts are visible to anyone with access to your Supabase project, which is you. For Ghosted (names of friends) a passphrase is the better choice.
- With a passphrase the server sees ciphertext only. **If you forget it the cloud copy cannot be opened**; the data on your devices is not affected.
- The passphrase lives in memory for the page's life and is never stored; after a reload you type it again.
- Notifications never name a person or a fact: the server cannot know them.
- Signing in sends your email address to Supabase (and its mail provider). It is how the link reaches you.

## Limits

- Delivery of a notification can be up to a minute late.
- The Edge Function and the schedule are a small server-side piece you deploy yourself; the free tier is enough.
- Supabase's built-in email sender allows only a few sign-in emails an hour. Add your own SMTP for more.
- iPhone: notifications work only for an app added to the Home Screen (iOS 16.4 or later).
- Not built: passkeys (Supabase has the feature, off by default), merging deletions, accounts shared between people.
