# Tech Stack

## Language

TypeScript everywhere, strict mode enabled.

## Repository

pnpm workspaces monorepo.

## Engine

Pure TypeScript. No UI. No framework dependencies.

## Apps and Shell

React with Vite.

## Tests

- **Vitest** for unit tests
- **fast-check** for property-based tests

## Storage

Browser local storage behind an adapter interface (`@decay-engine/persist` wraps it with versioning, migrations and a stale-write guard). By default: no accounts, no login, no database.

**Optional, off by default:** cloud sync, notifications while the app is closed, and Life Triage's "Load from my account". They use a Supabase project the owner sets up (`supabase/`), and run only when the build has its settings *and* the person signs in. The sync code lives in `packages/cloud`, is loaded on request, and is never in an app's main bundle (`scripts/check-bundles.mjs` checks this). See `docs/CLOUD.md`.

## Hosting

Static Netlify sites, one per app. The apps have no backend of their own and no serverless functions on Netlify.

The optional sync and push features use Supabase: SQL in `supabase/migrations/` (tables with row-level security, three small functions) and one Edge Function (`supabase/functions/send-due-pushes`) run on a schedule. None of it is needed to run the apps.

