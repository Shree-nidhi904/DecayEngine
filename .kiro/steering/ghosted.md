---
inclusion: fileMatch
fileMatchPattern: "apps/ghosted/**"
---

# Ghosted

Rules for any work under `apps/ghosted/`. They add to the always-on steering files. Where a rule already lives in another file, this file points to it instead of repeating it.

Look and screens: `docs/design/ghosted-visual-brief.md` (state table, numbered parts, "Done means").

## 1. What Ghosted is

- Each person is a window on a night street. The light shows **connection freshness**, never "how much someone cares" (`theme-and-wording.md`).
- Banned in UI text, sample data and test names: "doesn't care", "ignored you", "ghosted you". Do not invent other wording that blames or judges either person.
- Allowed: "fading", "went dark", "still lit", "empty windows". The three list names are in the table in `theme-and-wording.md`.

## 2. Boundaries

- Never edit `packages/engine/` for Ghosted. If Ghosted seems to need a change there, stop and report it (`engine-boundary.md`).
- `packages/shell/` may change only to add an optional prop or option whose default keeps today's behaviour (for example the time machine's range and jump list, the Triage budget choices, the Autopsy marker renderer). Each such change is its own task, and the shell and Study Dungeon tests must still pass unchanged. No other shell edits.
- `apps/ghosted/src/policy.ts` is written by Kiro from the spec (Requirements 1 to 4 and design section 2.2). This is a documented exception to the rule that Kiro never writes decay rules (`authorship.md`, "Exception: Ghosted's decay policy"). Implement exactly the contract table and nothing else; if the spec seems wrong or a formula is unclear, stop and ask instead of choosing.
- `apps/ghosted/src/autopsy-sentences.ts` was written by Claude Code at the developer's request, outside Kiro (`authorship.md`). It already exists. Kiro never creates, edits or "fixes" it; if a test seems to need it changed, stop and ask.
- Kiro may write the policy's tests. Outcome tests check the "Ghosted (straight line" reference rule and its row in the expected-outcomes table in `.kiro/specs/engine/design.md`.

## 3. Look

- Colours come from the Ghosted section of `design-tokens.md`; the shell rules there apply too. Add no colours outside it.
- Fonts: Monoton for the neon sign only, Josefin Sans for display text. Self-host the font files inside the app. Never load fonts from `fonts.googleapis.com` or `fonts.gstatic.com`.
- Every state is shown by light **and** glyph **and** word, as in the brief's state table. Never light alone.
- One primary action per screen region. Everything else is outlined or quiet.
- Every animation (splash, sign hum, flicker, boards falling, moths, fog, headlights, moon dock) sits inside `@media (prefers-reduced-motion: no-preference)`. Under reduced motion, show the end state with no movement.

## 4. Data

- Sample people are fictional. No real names, and no name repeats.
- Everything stays in the browser by default: local storage through the engine's storage adapter (wrapped by `@decay-engine/persist`). No network calls, analytics or contact imports from outside services. `apps/ghosted/src` contains no network call, and `no-network.test.ts` enforces it.
- The one opt-in exception is cloud sync and notifications (`docs/CLOUD.md`): they run only when the build has Supabase settings and the person signs in, through `packages/cloud`, loaded on request. The privacy line says a copy is also kept in the account while signed in.

## 5. Tests

- Follow `no-fake-tests.md` and `testing.md`.
- Use fixed timestamps (a constant `T0` plus day offsets). Never read the real clock: no `Date.now()`, no argument-less `new Date()`, no fake timers seeded from the real time.
- Property tests use `{ numRuns: 100 }` or more, with generators that reach alive, weak and dead items. Prove that with a coverage check like "Generator Coverage Check" in `.kiro/specs/engine/design.md`.

## 6. Logging

- Every Kiro session that touches Ghosted adds a new session to `docs/KIRO_LOG.md` in the format the existing sessions use (fields listed in `authorship.md`).
