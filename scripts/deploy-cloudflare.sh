#!/usr/bin/env bash
# Build one site and upload it to Cloudflare Pages with wrangler.
# Default is a PREVIEW deploy. Pass --prod to publish to production.
#
# Usage: scripts/deploy-cloudflare.sh <landing|study-dungeon|ghosted|policy-lab|life-triage> [--prod]
#
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment
# (see .kiro/powers/cloudflare-pages-deployment/skills/deploy/SKILL.md).
# It starts no server: it builds, then uploads the output folder once.
set -euo pipefail

target="${1:-}"
mode="${2:-}"

# Each site: Pages project name (its pages.dev address), pnpm package (empty = no build), output folder.
case "$target" in
  landing)         project="decay-engine";               pkg="";                                dir="site" ;;
  study-dungeon)   project="decay-engine-study-dungeon"; pkg="@decay-engine/study-dungeon";     dir="apps/study-dungeon/dist" ;;
  ghosted)         project="decay-engine-ghosted";       pkg="@decay-engine/ghosted";           dir="apps/ghosted/dist" ;;
  policy-lab)      project="decay-engine-lab";           pkg="@decay-engine/policy-lab";        dir="apps/policy-lab/dist" ;;
  life-triage)     project="decay-engine-life-triage";   pkg="@decay-engine/life-triage-app";   dir="apps/life-triage/dist" ;;
  *) echo "Usage: $0 <landing|study-dungeon|ghosted|policy-lab|life-triage> [--prod]" >&2; exit 2 ;;
esac

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID first." >&2
  exit 2
fi

branch="preview"
if [ "$mode" = "--prod" ]; then
  branch="main"
fi

cd "$(dirname "$0")/.."

if [ -n "$pkg" ]; then
  pnpm install --frozen-lockfile
  pnpm --filter "$pkg" build
fi

# Creating a project that already exists fails harmlessly.
npx --yes wrangler pages project create "$project" --production-branch main || true

npx --yes wrangler pages deploy "$dir" --project-name "$project" --branch "$branch"
