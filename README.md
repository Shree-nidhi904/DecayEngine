# Decay Engine

**A hospital for the things in your life: one engine for things that fade, die, and can be brought back.**

Built for [Kiroween 2026](https://kiroween.devpost.com/) in the **Skeleton Crew** category: one reusable foundation, shown with two different apps built on top of it.

| | |
|---|---|
| **Study Dungeon** | Facts you study fade into monsters. Review them before they die. |
| **Ghosted** | A street of windows, one per person. The light shows how recently you were in touch. |

Both run on the same engine. Ghosted was built on it with **zero changes to `packages/engine`**, and a script in the check suite proves it. Everything runs in the browser: no accounts, no server, no network calls.

[Run it](#running-it) · [How Kiro was used](#how-kiro-is-used) · [The Kiro log](docs/KIRO_LOG.md) · [Build status](#build-status)

---

## The problem

Some things get worse quietly when nobody is looking at them.

- A fact you studied last month is half gone today.
- A friend you used to talk to every week has not heard from you since spring.
- The milk in the fridge and the passport in the drawer both have a date you are not tracking.

These look like different problems, but they have the same shape:

1. The thing starts healthy.
2. It loses health as time passes.
3. If nobody acts, it dies.
4. Sometimes it can be brought back.

Today, each of these is solved by a separate app that rebuilds the same logic from scratch: health tracking, "what needs attention now", a list of dead things, a history of what happened. Decay Engine writes that logic once.

## What Decay Engine is

Decay Engine is a small TypeScript library. It tracks the life of any item:

```
ALIVE        healthy
  ↓
WEAK         fading, needs attention
  ↓
DEAD         moved to the graveyard
  ↓
RESURRECTED  back to ALIVE
```

Each app sets where the lines between these states are. Both apps here use the same lines: weak below 60, dead below 10.

The engine does not know what an item is. It does not know about studying, friends or food. An app plugs in by answering four questions about its items:

| Question | In code |
|---|---|
| How healthy is it now? | `healthAt(item, now)` |
| Something happened. What now? | `applyEvent(item, event, now)` |
| When should we look again? | `nextDueAt(item, now)` |
| Can it come back? | `resurrect(item, event, now)` |

That set of answers is called a **decay policy**. Write one policy and a skin, and you have a new app.

In return the engine gives every app the same tools:

| Function | What it does |
|---|---|
| `addItem` | Start tracking a new item |
| `tend` | Record that something happened to an item |
| `edit` | Change an item's details |
| `tick` | Recalculate health for everything and move items between states |
| `due` | List the items that need attention now |
| `graveyard` | List the dead items |
| `resurrect` | Try to bring a dead item back |
| `history` | Show everything that ever happened to an item |
| `triage` | "I have N minutes. What should I save?" |
| `autopsy` | The facts behind an item's death |
| `forecast` | What will die within any time horizon you give it |

**The rule that keeps it honest:** the engine never imports an app. If an app needs the engine changed, the policy contract is wrong, and the contract gets fixed instead.

## Three features every app gets for free

### Triage: "I have 20 minutes. What should I save?"

You tell the app how much time you have. Triage looks at everything that is fading and picks the set worth saving first that fits your time.

Each item is scored the same way in every app:

```
value = health you would restore × how close it is to dying × importance
```

- **Importance** is 1 to 3, and you set it. The engine never decides what matters to you.
- **Cost** is how many minutes tending the item takes, which you also set.
- Triage picks the set with the most value that fits the minutes you gave it.

### Autopsy: why did this die?

Every change is written to a history log. When an item dies, the autopsy reads that log and reports what happened: when it started fading, when it was last tended, how long the silence lasted, and how close you came to saving it. The engine reports the facts; each app turns them into its own words.

### The time machine

Decay is slow. Nobody wants to wait three weeks to see whether an app works.

Every engine function takes the current time as an input instead of reading the clock. So each app has a **time slider**: drag it forward 30 days and watch items weaken and die in seconds. Drag it back and they recover. Nothing is saved while you look into the future.

The same idea gives the **forecast** (what dies within a horizon you choose) almost for free. Study Dungeon shows it as markers on the time machine and as a line in the hero.

---

## App 1: Study Dungeon

**Who it is for:** anyone learning facts they need to keep, such as exam material, vocabulary or interview prep.

**What it solves:** people forget most of what they study unless they review it at the right time. Study Dungeon shows which facts are about to slip away and makes reviewing them a short fight.

**Look:** a dungeon lit by candles. A fading fact comes back as a monster.

| Question | Study Dungeon's answer |
|---|---|
| What is an item? | A fact: a question and its answer |
| How healthy is it now? | Halves every half-life since the last review |
| Something happened | Right answer: back to 100 and the half-life doubles. Wrong answer: drops to 45 and the half-life halves |
| When to look again? | When health is predicted to fall below 60 |
| Can it come back? | Yes, by answering it right |

A fact you keep getting right earns a longer half-life, so you see it less often. A fact you keep missing comes back sooner.

The three lists are **the Crypt** (healthy facts, asleep), **the Dungeon** (weak facts, weakest first) and **the Graveyard** (forgotten for too long; challenge a grave to bring it back).

## App 2: Ghosted

**Who it is for:** anyone who wants to stay in touch with people and keeps meaning to.

**What it solves:** contact fades without anyone deciding it should. Ghosted shows who you have not been in touch with for longer than your usual rhythm, before the gap becomes awkward.

**Look:** a street of windows. Each window is a person, and its light shows how recently you were in touch.

| Question | Ghosted's answer |
|---|---|
| What is an item? | A person you want to stay in touch with |
| How healthy is it now? | Falls in a straight line, reaching 0 at three times their usual rhythm |
| Something happened | A quick text adds 40. A call or a meet-up restores 100 |
| When to look again? | When freshness falls below 60 |
| Can it come back? | Yes, if they reply |

Ghosted measures **connection freshness**: how recently you were in touch. It never measures how much someone matters.

The three lists are **Still lit**, **Fading** and **Empty windows**.

**Built.** Ghosted runs on the same engine as Study Dungeon, with **zero changes to `packages/engine`**. What it has:

- **The street:** each person is a window on a house, grouped by relationship ("Others" for people with no tag). The window's light is `health / 100`; a fading window flickers, a dark one is boarded up. Every state is shown three ways: light, glyph (circle, triangle, cross) and word (lit, flickering, boarded up; "lit again" after a reconnect).
- **The hero** says who needs attention and offers one action, such as "Reach out to Dan".
- **Reach out** logs a real contact (sent a message, had a call or met up) and shows the freshness before and after. **Reconnect** brings a dark window back, fully lit, when they reply. **Autopsy** charts the last life with a marker per contact and explains in words how the window went dark.
- **Triage** with 15, 30, 60 or 120 minutes (or your own number), **a forecast** of who goes dark in 7, 30 or 90 days, and **the moon-clock dock**: a time machine that looks up to a year ahead, with a marker for each person's fade and dark day. Nothing is saved while you look ahead.
- **Back up, restore and import:** a JSON backup file, and import from pasted lines (`name | relationship | rhythm days | last contact`).
- A short splash once per tab (never under reduced motion), a neon sign, and every animation behind `prefers-reduced-motion`.

To fit Ghosted, the shared shell gained **three optional additions**, each off by default, so Study Dungeon is unchanged:

| Shell component | Optional addition |
|---|---|
| `TimeMachine` | `maxDays` and `jumpDays`: Ghosted uses 365 days and jumps of +30, +90, +180 days and +1 year |
| `TriagePanel` | `budgets` and `defaultBudget`: Ghosted offers 15, 30, 60 and 120 minutes |
| `AutopsyDialog` | `markers`, `renderMarker` and `markerSummary` for the app's own chart markers (here text, call and meet-up), plus `focusContentOnOpen` |

`scripts/check.sh` runs `scripts/check-engine-unchanged.sh`, which compares `packages/engine` (and the shell's allowed files) with the commit before the Ghosted work and fails on any other change.

## Why these two apps

The two apps decay in different ways, and the same engine runs both:

| | Study Dungeon | Ghosted |
|---|---|---|
| Shape of decay | Exponential (half-life) | Straight line |
| What slows it | Getting answers right | Staying in touch |
| Coming back | A test of you | A reply from them |
| Look | A dungeon lit by candles | A street of windows at night |

The test of the reuse claim was Ghosted. It needed a new policy and a new skin, and `scripts/check-engine-unchanged.sh` shows `packages/engine` has no change from the Ghosted work. A third app, such as food and subscription expiry, would be the same job again: one policy and one skin.

---

## Architecture

```
decay-engine/
  packages/
    engine/              the core: states, policy contract, Triage, Autopsy, forecast, history
    shell/               the shared frame: counters, item card, history, Triage panel, time machine
  apps/
    study-dungeon/       app 1
    ghosted/             app 2, built on the unchanged engine
  scripts/               check.sh and the engine-unchanged check
  docs/                  design notes, the wireframe and the Kiro log
  .kiro/                 Kiro specs, steering, hooks and a custom agent
```

How the pieces talk to each other:

```
        the app                          the engine
  ┌──────────────────┐   policy    ┌──────────────────────┐
  │ what an item is  │ ──────────▶ │ health and states    │
  │ how it decays    │             │ due queue, graveyard │
  │ how it revives   │ ◀────────── │ history, Triage      │
  │ how it looks     │   results   │ time passed in       │
  └──────────────────┘             └──────────────────────┘
                                             │
                                    storage (this browser)
```

Technology:

| Part | Choice |
|---|---|
| Engine | TypeScript (strict), no UI code, no runtime dependencies, time passed in as an input |
| Tests | Vitest unit tests, outcome tests and fast-check property-based tests |
| Apps | React with Vite, in a pnpm monorepo |
| Look | CSS and SVG only |
| Storage | The browser's local storage, so there are no accounts, no login and no server |

Engine rules checked by property-based tests:

- Health is always between 0 and 100.
- A dead item never appears in the due list.
- The same input at the same moment gives the same answer.
- Triage never goes over your time budget, and finds the best possible set.
- Looking into the future (view, Triage, Autopsy, forecast) never changes saved data.

Outcome tests check exact results, for example: "a Ghosted contact with a 30-day rhythm goes dark just after day 81 if you never get in touch".

## How Kiro is used

The project is built with [Kiro](https://kiro.dev). The `.kiro/` folder is committed on purpose.

| Kiro feature | Use |
|---|---|
| Specs | The engine spec, then one spec per app (Study Dungeon, Ghosted), each with requirements, design and tasks |
| Steering | Product, engine boundary, structure, testing, theme and wording, and who writes what |
| Hooks | Run the engine tests when an engine file is saved; check an app's policy when its policy file is saved; scaffold a new decay policy on request |
| Custom agent | `policy-reviewer`: a read-only reviewer that checks a policy against the contract, the steering and the spec |
| Property-based testing | The engine rules listed above |

The decay rules are set by me in the specs. I wrote Study Dungeon's policy by hand; for Ghosted I let Kiro write the policy from the spec's formulas and checked it with the `policy-reviewer` agent and the tests (a documented exception in the authorship steering). Study Dungeon's cause-of-death sentences are hand-written; Ghosted's were written by Claude Code outside Kiro (see the authorship steering). Kiro wrote most of the engine from the spec (types, errors, state derivation, settle, bisection, serialization, storage adapters, checkPolicy, forecast) and their tests, and writes the UI, the app glue and the app tests. I ran the WSL verification and wrote the `DecayEngine` class (tasks 9–19), the Triage selection and the Autopsy analysis, with their tests, and the engine's property-based tests. Triage implements the locked value rule from the product steering; Autopsy reports facts only, and each app writes its own cause-of-death sentences. Each session is recorded in [docs/KIRO_LOG.md](docs/KIRO_LOG.md): what Kiro produced, what was changed by hand, and what went wrong. A full write-up comparing spec-driven work with free-form prompting will be added before submission.

## Build status

- [x] Engine spec: requirements, design, tasks
- [x] Steering, hooks and the `policy-reviewer` agent
- [x] Engine and tests (701)
- [x] Study Dungeon (465 app tests, 152 shell tests)
- [x] Ghosted (665 tests), with the engine unchanged
- [ ] Deployed sites
- [ ] Demo video
- [ ] Kiro write-up

`bash scripts/check.sh` runs all of it: install, typechecks, the engine-unchanged check, every test suite and both production builds.

## Running it

You need Node 20.19 or later (22.12+ recommended) and pnpm.

```bash
pnpm install

# Study Dungeon, with hot reload: open the address it prints (http://localhost:5173)
pnpm --filter @decay-engine/study-dungeon dev

# Or the production build, served locally (http://localhost:4173)
pnpm --filter @decay-engine/study-dungeon build
pnpm --filter @decay-engine/study-dungeon preview

# Ghosted, with hot reload: open the address it prints
pnpm --filter @decay-engine/ghosted dev

# Ghosted's production build, served locally from the site root
pnpm --filter @decay-engine/ghosted build
pnpm --filter @decay-engine/ghosted preview

# Ghosted's tests only
pnpm --filter @decay-engine/ghosted test

# Every check: install, typechecks, the engine unchanged, the engine, shell and app tests, and the builds
bash scripts/check.sh
```

On first open, Study Dungeon offers **Load sample data** (12 facts: 4 alive, 4 weak, 4 dead) or **Start empty**. Everything is saved in this browser's local storage; **Reset all data** clears it.

On first open, Ghosted offers **Load sample street** (12 made-up people: 4 lit, 4 flickering, 4 boarded up, one of them dark from the day they were added) or **Start empty**. Its data is saved in this browser's local storage under its own keys; its **Reset all data** clears only those.

Ghosted's tests (Vitest with jsdom, fixed timestamps, never the real clock):

- the policy: unit tests and hand-worked outcomes (for example, a 30-day rhythm left alone is exactly 60 on day 36, exactly 10 on day 81 and dark just after), and fast-check property tests for its rules, with a generator coverage check that lit, flickering and boarded-up people are all generated;
- the components, the sample street and the autopsy sentences;
- the App as a whole: the first run, a preview never saving anything (a property test over every write control), storage problems, and keyboard and focus;
- source checks: no import from Study Dungeon, no network, no clock in the tests, colours from the Ghosted tokens only, contrast, motion only behind `prefers-reduced-motion`, the 320px layout and the wording rules.

## Licence

[MIT](LICENSE). Everything stays in your browser. Names and items in the samples are made up.
