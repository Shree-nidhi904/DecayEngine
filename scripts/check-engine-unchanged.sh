#!/usr/bin/env bash
# Requirement 29: during the Ghosted work packages/engine is unchanged, and
# packages/shell changed only as Requirements 26 to 28 allow.
#
# The "before" state comes from git history, so no file has to be recorded:
# it is the parent of the first commit that added anything under
# .kiro/specs/ghosted. If nothing about Ghosted is committed yet, it is HEAD.
#
# Exit 0: nothing outside the allowed changes (or the check cannot be made on a
#         shallow clone and says so). Exit 1: a change was found.
# Exit 2: the check cannot run.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "check-engine-unchanged: this is not a git repository." >&2
  exit 2
fi
if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  echo "check-engine-unchanged: skipped, this is a shallow clone and the history before Ghosted is missing."
  exit 0
fi

first="$(git log --diff-filter=A --format=%H -- .kiro/specs/ghosted | tail -n 1)"
if [ -n "$first" ]; then
  if ! base="$(git rev-parse --verify --quiet "${first}^")"; then
    echo "check-engine-unchanged: the first Ghosted commit ${first:0:12} has no parent commit." >&2
    exit 2
  fi
  label="${base:0:12}, the commit before the first Ghosted commit"
else
  base="$(git rev-parse HEAD)"
  label="${base:0:12}, HEAD (no Ghosted commit yet)"
fi

# 29.1, 29.2: committed, staged and unstaged changes to tracked engine files since the base.
if ! git diff --exit-code --stat "$base" -- packages/engine; then
  echo "check-engine-unchanged: packages/engine changed since $label." >&2
  exit 1
fi
# 29.2: untracked files and any other working-tree change under packages/engine.
status="$(git status --porcelain --untracked-files=all -- packages/engine)"
if [ -n "$status" ]; then
  echo "$status" >&2
  echo "check-engine-unchanged: packages/engine has uncommitted changes." >&2
  exit 1
fi

# 29.4, 26.5, 27.4, 28.4: shell changes only in these files. Every existing shell test
# file is outside the list, so editing one fails here.
allowed='^packages/shell/src/(index\.ts|types\.ts|shell\.css|components/(TimeMachine|TriagePanel|AutopsyDialog)\.tsx|components/(TimeMachine\.range|TriagePanel\.budgets|AutopsyDialog\.markers|AutopsyDialog\.focus)\.test\.tsx)$'
changed="$( { git diff --name-only "$base" -- packages/shell; git ls-files --others --exclude-standard -- packages/shell; } | sort -u )"
outside="$(printf '%s\n' "$changed" | grep -Ev "$allowed" | grep -v '^$' || true)"
if [ -n "$outside" ]; then
  echo "$outside" >&2
  echo "check-engine-unchanged: packages/shell changed outside Requirements 26 to 28 since $label." >&2
  exit 1
fi

echo "packages/engine unchanged and packages/shell within Requirements 26 to 28, since $label."
