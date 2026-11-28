# Authorship and Division of Labor

This file records who built what, and tells Kiro which files it must not rewrite. The record behind it is `docs/KIRO_LOG.md`, summarised in `docs/KIRO_WRITEUP.md`.

| Who | Role |
|---|---|
| **The developer** | Product vision, architecture decisions, specifications, design direction and technical decisions. |
| **Kiro** | The majority of the recorded implementation: the engine modules, the shared shell, almost all of Ghosted, most of Study Dungeon's screens, the late features, the Haunt pass and the Art direction pass in both apps, the storage, offline and cloud infrastructure, most of the tests, the specs, and the browser checks. |
| **Claude Code** | Significant engineering work outside Kiro, at the developer's request: the core engine class and algorithms, visual implementation, and testing. |

## Rules for Kiro

- Never create, rewrite, reformat or "fix" a file listed under "What Claude Code wrote". If a task seems to need one changed, stop and ask. When a spec task names such a file and says what to change, change only that part (for example the `scripts/check.sh` header, or `TimeDock.tsx` for tasks L2 and L3), and say so in the log.
- Never invent a decay rule. Every formula, threshold and constant comes from the developer through a spec. If a rule is unclear or looks wrong, stop and ask.
- Kiro writes decay-rule code only in the two exceptions below.
- Log every session in `docs/KIRO_LOG.md` (see the last section).

## What the developer decides

The product idea, the architecture (one engine, a policy contract, a skin per app, no backend by default), every spec decision, the design direction, and the review and correction of each Kiro stage. The wireframes, the visual briefs and `design-tokens.md` were made outside Kiro.

The decay rules: every formula, threshold and limit is set in the specs (for example weak 60 / dead 10, half-life 1 to 180 days). The rules cover the policy functions that say how an item decays and comes back:

- `thresholds: { weak: number; dead: number }`
- `init(payload, now)` → policyData
- `healthAt(item, now)` → number (0-100)
- `applyEvent(item, event, now)` → { health, policyData }
- `nextDueAt(item, now)` → timestamp | null
- `resurrect(item, event, now)` → { ok: true, ... } | { ok: false, reason } (synchronous)

## What Kiro built

Kiro is the main tool of this project. By the Nov 28 usage panel it used 2874.51 of the 4,000 hackathon credits, over more than 85 logged sessions.

### Specs and project setup

- **Four specs**: engine (18 requirements, about 2,300 lines of design, 37 tasks), Study Dungeon (18 requirements, 58 tasks with sub-tasks), Ghosted (32 requirements, 13 correctness properties) and extensions. The first three came to about 7,700 lines when approved. Each stage was reviewed and corrected by the developer.
- **Spec extensions for the late features**: L2, P4 and P5 (Sessions 44, 46 and 58), E1 (62), R1 (65), L3 (69), L5 (71) and L6 (73).
- **`.kiro/`**: the steering files, three hooks, the `policy-reviewer` agent, the MCP settings (Context7 and Playwright) and the `cloudflare-pages-deployment` power.

### Engine (`packages/engine`)

- Types, errors, state derivation, `settle`, bisection, serialization, the storage adapters (`InMemoryAdapter`, `LocalStorageAdapter`), `checkPolicy`, forecast, and the fake test policy, with their unit tests.
- The engine-unchanged check, `scripts/check-engine-unchanged.sh`, rewritten against the `engine-complete` tag and tested on planted violations (Session 42).

### The shared shell (`packages/shell`)

Hero, counters, item card, history log, autopsy dialog, Triage panel and time machine, with their tests. Kiro also added the optional props Ghosted needed (time machine range and jumps, Triage budget choices, autopsy markers and focus; Sessions 22 to 24) and the `picksNote` prop for P5, each with today's behaviour as the default.

### Ghosted (`apps/ghosted`)

Built by Kiro from its spec in Sessions 20 to 37 (about 790 credits), apart from the few files listed under Claude Code:

- The decay policy (see the exception below), its tests and the property suites (Properties 1 to 13).
- Every screen and dialog: the Street, the Hero, the person card and three lists, Reach out, Reconnect, Add and Edit, the autopsy with its chart, Triage, the splash and neon sign, the moon-clock dock, forecast, backup, restore and import.
- Sample data, wording, the copied engine glue, and the source checks (no network, shell boundary, app boundary, tokens, motion, 320px layout).

### Study Dungeon (`apps/study-dungeon`)

Built by Kiro in 7 rounds (Sessions 13 to 18, about 362 credits): the Vite and React setup, theme and wording, the engine instance and ticking, the Crypt, Dungeon and Graveyard lists, add and edit, fight and challenge, the time machine with preview mode, Triage and its fight queue, the autopsy dialog, first run, reset, the hero section, the tour, the icons, accessibility, the responsive layout, the sound toggle, and the policy tests. Kiro also wrote the memory model (see the exception below).

### Late features, in both apps

The compact time dock (L2), the 7-day loss line (P4), the Triage saves line (P5), `packages/insight` with replay and what-if (E1), the Rescue Point line in each autopsy (R1), live state changes while the tab is open (L3), opt-in notifications (L5) and the first-look intro (L6). Each was a spec first, then a build, then a browser check.

### Haunt pass, in both apps

Built by Kiro from `.kiro/specs/haunt-pass`, in sessions that were not logged. The only files in it written by Claude Code are the two `App.haunt.test.tsx` files (see below).

- **New in both apps**: `preview-crossings.ts`, `doom.ts`, `spooky-level.ts`, `guide.ts`, `share-card.ts`, `components/Haunt.tsx`, `components/ShareCard.tsx`, `styles/haunt.css`, and their tests `haunt.test.ts` and `share-card.test.ts`.
- **New in Ghosted**: `sound.ts` (copied from Study Dungeon's, with Ghosted's own sounds), `sound.test.ts`, `components/HauntSettings.tsx`.
- **New in Study Dungeon**: `components/SpookyToggle.tsx`.
- **Changed in Ghosted**: `App.tsx`, `Hero.tsx`, `Street.tsx`, `House.tsx`, `NeonSign.tsx`, `Splash.tsx`, `LiveToast.tsx`, `PersonCard.tsx`, `ReachOutDialog.tsx`, `ReconnectDialog.tsx`, `wording.ts` (`wispText`, `hauntText`) and `motion.css`.
- **Changed in Study Dungeon**: `App.tsx`, `HeroSection.tsx`, `ThreeLists.tsx`, `FactCard.tsx`, `FightDialog.tsx` (the critical hit only, not the P6 lines), `ChallengeDialog.tsx`, `wording.ts` (`keeperText`, `hauntText`) and `animations.css`.
- **Changed on the landing page**: the hero scene and the "Built with Kiro" strip in `site/index.html` and `site/styles.css`.
- `animations.css` and `site/` are Claude Code's files. The Haunt pass changed only the parts named above.

### Art direction pass, in both apps

- **Ghosted, new**: `components/Scene.tsx` (the skyline, the branch and the road), `styles/scene.css` (sky, moon, houses with four roof shapes, chimneys, doors and porch lights, streetlamps, the wet road, ground fog, the hero's counters as house fronts, the card tops, the hanging sign) and `components/Scene.test.tsx`.
- **Ghosted, changed**: `Street.tsx` (the scenery and each house's place), `House.tsx` (`variant`, `ROOFS`, `porchValue`, the chimney, door and lamp), `Haunt.tsx` (two clouds) and `motion.css` (smoke, clouds, town windows, branch, lamps, the hero's fading window).
- **Study Dungeon, new**: `styles/shelf.css` (the settings as a stone shelf with lever switches) and `styles/depth.css` (the raid gate, the Dungeon scene's arch).
- **Study Dungeon, changed**: `App.tsx` (imports the two files before `layout.css`) and `animations.css` (the queue and the gate glow, stopped in the reduce block too; Claude Code's file, changed only there).

### Storage, offline and cloud infrastructure

- `packages/persist`: the versioned storage adapter, migrations, the stale-write guard and quarantine, wrapping the engine's `StorageAdapter`.
- `packages/pwa`: the web app manifest, the offline service worker with its push handlers, and the install and persistence helpers.
- `packages/cloud`: the optional sync, encryption, push and account reading on Supabase, loaded on request.
- `supabase/`: the SQL migrations, the `send-due-pushes` Edge Function and the cron template.
- `docs/CLOUD.md` and `docs/PUSH_SETUP.md`.

### Policy Lab, Life Triage and the guide

`apps/policy-lab`, `apps/life-triage`, `packages/life-triage` and `docs/ADDING_A_POLICY.md`: Kiro, according to the developer, in sessions that were not logged. Session 78 wrote their spec afterwards, and Session 79 closed the gaps it found (trust warning, honest `checkPolicy` text, state shapes on the chart, 44px targets, "goes dark" wording, file handling).

### The developer's feedback list (Sessions 84 to 88)

Kiro, from the developer's 24 points in `docs/FEEDBACK_LIST.md`:

- **Landing page** (Session 84, IDE): `site/index.html` and `site/styles.css` redesigned (Claude Code's files, with the developer's permission), the Kiro strip and the Policy Lab card removed, two checks added to `scripts/check-site.sh`.
- **Life Triage** (Sessions 84 and 85): plainer wording, one backup box per app, "Open in" links (`links.ts`).
- **Ghosted** (Session 86, IDE): the top bar, Settings and Profile sheets, the activity history, the corner toast, the moon-clock bar's Play and Back to now, list tabs, the (i) notes, the counters share card, `?tend=`, the far town, and the shell's optional `autoRun` prop (Ghosted Requirement 41).
- **Study Dungeon** (Sessions 87 and 88, CLI): the same frame, the time bar, Fight the weakest, the (i) notes, the counters share card, the memory model example, the brick background and the side pillars. `TimeDock.tsx` (Claude Code's file) changed for the time bar, with the developer's permission.

### Verification and deployment

- **Browser checks** from Kiro CLI with the Playwright MCP (Sessions 41 and 43 to 77): screenshots of both live sites, and element measurements at 1280×800, 390×844 and 320×640 that found layout failures no unit test caught.
- **Policy review** by the `policy-reviewer` agent, in the IDE (Session 36) and the CLI.
- **Deployment**: the Netlify configs and draft deploys (Session 40, with the `netlify-deployment` power), and the Cloudflare Pages deploy with a custom power and `scripts/deploy-cloudflare.sh` (Session 81).

## Exception: Ghosted's decay policy

- `apps/ghosted/src/policy.ts` was written by Kiro (Session 20, task 0.2) from Requirements 1 to 4 and design sections 2.1 and 2.2 of the Ghosted spec. The formulas are the developer's.
- The `policy-reviewer` agent reviewed it (Session 36). It flagged `nextDueAt` using the numbers 60 and 10 instead of reading the thresholds, and the developer accepted the fix.
- Kiro also wrote its tests and property suites (Session 29). A mutation check outside Kiro broke the policy nine ways: eight were caught, and the ninth was an equivalent mutant.

## Exception: Study Dungeon's memory model

`apps/study-dungeon/src/policy-memory.ts` is a second decay policy for Study Dungeon (the "Memory model" switch).

- **The rules are the developer's.** The developer chose the spacing effect, the per-fact difficulty, the `grownHalfLife` formula and every constant: `SPACING_GAIN` 1.6, the 0.9 in the spacing term, `LAPSE_SHARE` 0.4, the difficulty steps −0.3 and +1, the 1 to 10 range, the default 5, and the first difficulties 7 / 5 / 3. The constants are hand-picked, not fitted to any data, and the model is not FSRS.
- **The code is Kiro's**, written in sessions that were not logged at the time. Unlike Ghosted, there was no spec first. The rules were written out afterwards, with worked examples, in `.kiro/specs/extensions/design.md` section 2.2 (Session 78). The decision is recorded in Session 80.
- **Review.** The tests in `policy-memory.test.ts` check the worked examples and the rules' properties. The `policy-reviewer` agent has not been run on this policy yet (extensions task 7.2).
- **The `difficulty?` field** in `FactPolicyData` (`apps/study-dungeon/src/policy.ts`, Claude Code's file) was added by Kiro for the memory model, with no task naming it. Nothing else in `policy.ts` changed.

## What Claude Code wrote (outside Kiro)

Claude Code (Anthropic's coding agent) ran in WSL at the developer's request, with no Kiro credits, because Kiro's IDE shell could not run commands on this setup. It also ran the tests, typechecks and break-the-code checks in Sessions 9 to 18; first-person entries there ("I ran", "I wrote") were written while it did that work. 

- **Engine** (Sessions 10 and 11): the `DecayEngine` class (`src/engine.ts`, tasks 9 to 19) and its tests; Triage selection (`src/triage.ts`, task 21, an exact 0/1 knapsack on the locked value rule); Autopsy analysis (`src/autopsy.ts`, task 22); the property-test generators and engine property tests (`tests/generators.ts`, `tests/properties/`, tasks 27 to 35); the boundary test (`tests/unit/boundary.test.ts`, task 32.3).
- **Study Dungeon, during its spec**: the decay policy (`src/policy.ts`, task 2.1; its tests are Kiro's) and the cause-of-death sentences (`src/autopsy-sentences.ts`, task 10.1; its tests and dialog are Kiro's). Alongside Sessions 16 and 17, in new files: `sample-data.ts`, `stats.ts`, `contrast.test.ts`, `storage-errors.ts`, `components/ErrorBoundary.tsx`, `styles/problem.css`, `styles/animations.css`, `sound.ts`, their tests, and `scripts/check.sh` (Kiro later added the Ghosted, Insight, Policy Lab and Life Triage steps).
- **Study Dungeon visual pass and extras** (Nov 19): `creatures.ts`, `timeline.ts`, `components/art/`, `HeroBoss.tsx`, `DialogFoe.tsx`, `DoorSplash.tsx`, `RaidIntro.tsx`, `TimeDock.tsx` (later changed by Kiro for L2 and L3), `styles/world.css`, `dock.css`, `fx.css`; answer checking (`answer-check.ts`, `AnswerPanel.tsx`, `AnswerCheckSetting.tsx`); `ranks.ts`, `import-facts.ts`, `ImportFactsDialog.tsx`, `backup.ts`, `BackupControls.tsx`; their tests; and the shell props `belowSlider` and `initialBudget`.
- **Ghosted cause-of-death sentences**: `apps/ghosted/src/autopsy-sentences.ts` (task 0.3). Its tests are Kiro's.
- **Fixes after Nov 20**: the clock guard (`src/clock-guard.ts` and its test in both apps, and the `heldClock` lines in each `App.tsx`); the P6 fixes (Study Dungeon's too-few-facts note, Ghosted's `duplicateReasons`); the first landing page (`site/`, `scripts/check-site.sh`; Kiro redesigned `site/index.html` and `site/styles.css` in Session 84 at the developer's request, and added two checks to `check-site.sh`); the CSS blocks marked "Written by Claude Code" in both apps' `dock.css`, Ghosted's `layout.css` and Study Dungeon's `world.css`, with `dock-narrow.test.ts` and the CSS test values they pin; and a few test fixes in Kiro's tests (Sessions 59, 61, 64 and the Rescue Point property).
- **Haunt pass App tests**: `apps/ghosted/src/App.haunt.test.tsx` and `apps/study-dungeon/src/App.haunt.test.tsx`. The rest of the Haunt pass is Kiro's.

## Kiro usage log

Every Kiro contribution is logged in `docs/KIRO_LOG.md` using the session format already established in that file. Each session records:

- Goal
- Kiro feature used
- What Kiro produced
- What was changed by hand
- What went wrong or surprised
- Credits used
- Screenshot file names

Work done outside Kiro is logged too, under its own heading ("Work outside Kiro on ..."), with the files it touched, so it is never counted as Kiro's. Still missing: Kiro session entries for the Haunt pass, the Art direction pass and the storage, offline and cloud infrastructure. This log is part of the Kiroween submission and shows how the IDE was used.
