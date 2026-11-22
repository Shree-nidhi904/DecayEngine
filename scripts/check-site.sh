#!/usr/bin/env bash
# Checks the landing page (site/). It must name both live apps, link the source and the Kiro
# write-up, and make no network request of its own: no script, no web font, no fetch.
# Written by Claude Code, outside Kiro, at the developer's request.
set -u
cd "$(dirname "$0")/.."
f=site/index.html
css=site/styles.css
fail=0
need() { grep -q "$1" "$f" || { echo "site: missing $2"; fail=1; }; }
need 'decay-engine-study-dungeon.netlify.app' "the Study Dungeon link"
need 'decay-engine-ghosted.netlify.app' "the Ghosted link"
need 'github.com/Shree-nidhi904/DecayEngine"' "the source link"
need 'docs/KIRO_WRITEUP.md' "the Kiro write-up link"
need '<h1' "the h1"
need 'lang="en"' "the lang attribute"
grep -qi '<script' "$f" && { echo "site: a script tag is not allowed"; fail=1; }
grep -Eqi '@import|fonts\.googleapis|fonts\.gstatic|url\(https?:' "$css" "$f" && { echo "site: web fonts and remote files are not allowed"; fail=1; }
grep -Eqi '<link[^>]*(href|src)="https?:' "$f" && { echo "site: a remote link/stylesheet tag is not allowed"; fail=1; }
[ "$fail" -eq 0 ] && echo "site: ok (both apps linked, no script, no remote files)"
exit "$fail"
