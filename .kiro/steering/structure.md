# Project Structure

```
packages/engine/       engine and policy test kit
packages/shell/        shared frame: hero, counters, item card, history, 
                       autopsy, Triage panel, time machine
packages/insight/      replay and what-if, on the engine's public API (task E1)
packages/persist/      versioned storage adapter, migrations, stale-write guard (wraps the engine's StorageAdapter)
packages/pwa/          web app manifest, offline service worker (with push handlers), install and persistence helpers
packages/cloud/        optional sync, encryption, push and account reading, on Supabase (loaded on request)
supabase/              optional server side: SQL migrations, one Edge Function, a cron template
apps/study-dungeon/
apps/ghosted/
apps/policy-lab/
apps/life-triage/
site/                  landing page: static HTML and CSS, one page, links both apps (task P3)
docs/                  logs and guides
```

## Shared shell components

The shell (`packages/shell/`) provides:
- Hero section (what needs attention)
- Three counters (alive/weak/dead)
- Item card layout
- History log viewer
- Autopsy panel
- Triage panel
- Time machine slider

Each app supplies its own skin (colors, fonts, wording) and policy (decay rules).

## No backend

There is no `server/` folder and no `templates/` folder. Static sites on Netlify, one per app (each app has its own `netlify.toml`). The apps work completely without a server.

`supabase/` holds the *optional* server side (SQL and one Edge Function). It is not deployed with the apps and nothing in `apps/*/src` depends on it: the sync code is reached only through a dynamic `import("@decay-engine/cloud")`, and the apps' source scans (`no-network.test.ts` and its siblings) still pass unchanged.

