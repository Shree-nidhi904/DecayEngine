#!/usr/bin/env bash
# Two checks, one line of output each:
#
# 1. engine: packages/engine has no code change since the engine was completed,
#    so neither app (Study Dungeon, Ghosted) needed an engine change. The
#    baseline is the tag engine-complete (commit c67c553, "Completed Engine
#    Spec Tasks"); both apps were built after it. Without the tag, the SHA is
#    used.
#    - src/ and tests/: a change is allowed only if every changed line is a
#      whole-line comment (it starts, after whitespace, with //, /* , * or */).
#      A trailing comment after code is not ignored, and a hunk that mixes a
#      comment with code counts as a code change.
#    - README.md is not compared.
#    - Every other file (package.json, tsconfig.json, vitest.config.ts) must be
#      byte-for-byte unchanged.
#    - Any untracked file under packages/engine fails.
#    Changes are compared with the working tree, so committed, staged and
#    unstaged changes are all checked.
#
# 2. shell (Ghosted), Requirement 29: packages/shell changed only as
#    Requirements 26 to 28 of the Ghosted spec allow. Its baseline is the
#    parent of the first commit that added anything under .kiro/specs/ghosted
#    (HEAD if there is none). There is no shell allow-list for Study Dungeon.
#
# Exit 0: both checks pass (or this is a shallow clone, and it says so).
# Exit 1: a change was found. Exit 2: the check cannot run.
#
# Engine part rewritten by Kiro for task C5 (see docs/KIRO_LOG.md); the shell
# part is unchanged from Ghosted task 2.10.
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

# ---------------------------------------------------------------- engine
engine_sha="c67c55362b4aa1bdb4c57603426421e6daec165c"
if tagged="$(git rev-parse --verify --quiet "refs/tags/engine-complete^{commit}")"; then
  if [ "$tagged" != "$engine_sha" ]; then
    echo "check-engine-unchanged: tag engine-complete points at ${tagged:0:12}, not ${engine_sha:0:12}." >&2
    exit 2
  fi
  ebase="$tagged"
  elabel="engine-complete (${engine_sha:0:7})"
elif ebase="$(git rev-parse --verify --quiet "${engine_sha}^{commit}")"; then
  elabel="${engine_sha:0:7} (tag engine-complete not found)"
else
  echo "check-engine-unchanged: the engine baseline ${engine_sha:0:12} is not in this repository." >&2
  exit 2
fi

comment_only='^[[:space:]]*(//|/\*|\*)'

# Untracked files anywhere under packages/engine.
untracked="$(git ls-files --others --exclude-standard -- packages/engine)"
if [ -n "$untracked" ]; then
  echo "$untracked" >&2
  echo "check-engine-unchanged: packages/engine has untracked files." >&2
  exit 1
fi

# Files outside src/, tests/ and README.md: no change at all.
other="$(git diff --name-only "$ebase" -- packages/engine \
  ':(exclude)packages/engine/src' ':(exclude)packages/engine/tests' \
  ':(exclude)packages/engine/README.md')"
if [ -n "$other" ]; then
  echo "$other" >&2
  echo "check-engine-unchanged: packages/engine files changed since $elabel." >&2
  exit 1
fi

# src/ and tests/: whole-line comment changes only. --name-only ignores -I, so
# each changed file is checked on its own with --quiet -I.
code_changed=()
ignored_files=()
ignored_lines=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  if git --no-pager diff --quiet -I"$comment_only" "$ebase" -- "$file"; then
    # A changed line is a removed or added line; a replaced line counts once.
    read -r added deleted < <(git --no-pager diff --numstat "$ebase" -- "$file" | awk '{a+=$1; d+=$2} END {print a+0, d+0}')
    n=$(( added > deleted ? added : deleted ))
    ignored_lines=$(( ignored_lines + n ))
    ignored_files+=("${file#packages/engine/} ($n)")
  else
    code_changed+=("$file")
  fi
done < <(git diff --name-only "$ebase" -- packages/engine/src packages/engine/tests)

if [ "${#code_changed[@]}" -gt 0 ]; then
  printf '%s\n' "${code_changed[@]}" >&2
  echo "check-engine-unchanged: packages/engine code changed since $elabel." >&2
  exit 1
fi
if [ "${#ignored_files[@]}" -gt 0 ]; then
  ignored="; $ignored_lines comment-only lines in ${#ignored_files[@]} files ignored: $(printf '%s, ' "${ignored_files[@]}" | sed 's/, $//')"
else
  ignored="; no comment-only changes"
fi
engine_line="engine: no code change since $elabel$ignored"

# ---------------------------------------------------------------- shell (Ghosted)
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
# 29.4, 26.5, 27.4, 28.4, 36.11: shell changes only in these files. Every existing shell test
# file is outside the list, so editing one fails here. Requirement 36.11 (task P5) adds
# only the new test file TriagePanel.note.test.tsx; its source changes are in
# TriagePanel.tsx and shell.css, already listed.
allowed='^packages/shell/src/(index\.ts|types\.ts|shell\.css|components/(TimeMachine|TriagePanel|AutopsyDialog)\.tsx|components/(TimeMachine\.range|TimeMachine\.external|TriagePanel\.budgets|TriagePanel\.note|AutopsyDialog\.markers|AutopsyDialog\.focus)\.test\.tsx)$'
changed="$( { git diff --name-only "$base" -- packages/shell; git ls-files --others --exclude-standard -- packages/shell; } | sort -u )"
outside="$(printf '%s\n' "$changed" | grep -Ev "$allowed" | grep -v '^$' || true)"
if [ -n "$outside" ]; then
  echo "$outside" >&2
  echo "check-engine-unchanged: packages/shell changed outside Requirements 26 to 28 and 36 since $label." >&2
  exit 1
fi

echo "$engine_line"
echo "shell (Ghosted): within the allowed list since $label"
