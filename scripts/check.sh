#!/usr/bin/env bash
# Runs every check the project has, in order, and prints a short summary:
# install, the engine-unchanged check, typecheck (shell, app, Ghosted),
# tests (engine, shell, app, Ghosted), and the app and Ghosted builds.
# "app" is Study Dungeon.
# Run it from anywhere in WSL:  bash scripts/check.sh
# Exit code is 0 only when every step passes.
#
# Written by - Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.
# The three Ghosted steps were added by Kiro (Ghosted task 2.10, design section 8.3).

set -u
cd "$(dirname "$0")/.."

# Use the Linux Node from nvm, not a Windows one that may be earlier on PATH
# (see Session 11 in docs/KIRO_LOG.md).
if [ -d "$HOME/.nvm/versions/node" ]; then
  latest="$(ls -1 "$HOME/.nvm/versions/node" | sort -V | tail -n 1)"
  export PATH="$HOME/.nvm/versions/node/$latest/bin:$PATH"
fi

log_dir="$(mktemp -d)"
results=()
failed=0

step() {
  local name="$1"
  shift
  local log="$log_dir/$(echo "$name" | tr ' /' '__').log"
  printf '%-28s' "$name"
  if "$@" >"$log" 2>&1; then
    local summary
    summary="$(sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -E '^\s+Tests ' | tail -n 1 | sed 's/^\s*//')"
    echo "ok   ${summary}"
    results+=("ok   $name")
  else
    echo "FAIL (log: $log)"
    sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -E 'error|FAIL|×|Error' | head -n 15 | sed 's/^/     /'
    results+=("FAIL $name")
    failed=1
  fi
}

echo "Node $(node --version), pnpm $(pnpm --version)"
step "install"            pnpm install
step "engine unchanged"   bash scripts/check-engine-unchanged.sh
step "typecheck shell"    pnpm --filter @decay-engine/shell typecheck
step "typecheck app"      pnpm --filter @decay-engine/study-dungeon typecheck
step "test engine"        pnpm --filter @decay-engine/engine test
step "test shell"         pnpm --filter @decay-engine/shell test
step "test app"           pnpm --filter @decay-engine/study-dungeon test
step "build app"          pnpm --filter @decay-engine/study-dungeon build
step "typecheck ghosted"  pnpm --filter @decay-engine/ghosted typecheck
step "test ghosted"       pnpm --filter @decay-engine/ghosted test
step "build ghosted"      pnpm --filter @decay-engine/ghosted build

echo
if [ "$failed" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks failed. Full logs are in $log_dir"
fi
exit "$failed"
