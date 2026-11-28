---
name: deploy
description: Build a Decay Engine app and deploy it to Cloudflare Pages (preview first, production only when asked)
---

# Deploy a Decay Engine app to Cloudflare Pages

Apps are static Vite builds. There is no backend and no serverless function. Never start a server (`vite`, `vite preview`, `pnpm dev`); deploying is a one-shot upload.

## Settings that work (Git-connected project `decayengine`, Study Dungeon)

- Build command: `pnpm install --frozen-lockfile && pnpm --filter @decay-engine/study-dungeon build`
- Output directory: `apps/study-dungeon/dist`
- Root directory: empty (the repo root). The app needs `packages/*` from the workspace.
- Variables: `NODE_VERSION=22`, `PNPM_VERSION=12.21.0`
- Ghosted uses the same settings with `ghosted` in place of `study-dungeon`.
- Headers come from `apps/<app>/public/_headers` (Cloudflare reads the Netlify format). The service worker `sw.js` must stay `no-cache`.

## Step 1: Check the environment

- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` must be set. Run `test -n "$CLOUDFLARE_API_TOKEN" && echo set`. Never print, log or write the token.
- Run `npx wrangler whoami`; it should show the account.

## Step 2: Check the app first

Run `scripts/check.sh` (install, typechecks, tests, build). Do not deploy if it fails.

## Step 3: Preview deploy (default)

Run `scripts/deploy-cloudflare.sh study-dungeon`. It uploads to the branch `preview` of the direct-upload project `decay-study-dungeon` and prints a preview URL.

Follow the shell rules: one command per call, send long output to a file (`> /tmp/deploy.log 2>&1; echo EXIT $? >> /tmp/deploy.log`), run in the background with `nohup`, and read the log in a second call. Stop after two identical failures and report the command and its output.

## Step 4: Production deploy (only when the developer asks)

Run `scripts/deploy-cloudflare.sh study-dungeon --prod`. Ask the developer to confirm first; a production deploy is hard to undo.

## Step 5: Log it

Add a session to `docs/KIRO_LOG.md` in the existing format: goal, Kiro feature used (this Power), what Kiro produced, what was changed by hand, what went wrong, credits, screenshots.

## Notes

- Git-connected Pages projects cannot take direct uploads, which is why the script uses its own `decay-<app>` projects.
- The `cloudflare-api` MCP server lets you read the account (projects, deployments). It needs `CLOUDFLARE_API_TOKEN` approved under Kiro settings, "Mcp Approved Env Vars", and set as a Windows environment variable.
- The token needs Pages Write and Workers Scripts Write. Do not widen it.
