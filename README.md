# Decay Engine

**A hospital for the things in your life: one engine for things that fade, die, and can be brought back.**

Built for [Kiroween 2026](https://kiroween.devpost.com/) in the **Skeleton Crew** category: one reusable foundation, shown with separate apps built on top of it.

> **Status: in development.** This README describes the design. Nothing is deployed yet. Setup steps, the live URL, the demo video and screenshots will be added as each part lands. See [Build status](#build-status).

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

Each app sets where the lines between these states are. All three apps here use the same lines: weak below 60, dead below 10.

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

## App 3: Expiry Reaper (the reuse test)

**Who it is for:** anyone tracking things with an end date, such as food, medicine, subscriptions or documents.

**Look:** jars of time on shelves. Deal with them before the reaper arrives.

| Question | Expiry Reaper's answer |
|---|---|
| What is an item? | Something with an end date |
| How healthy is it now? | Full until the warning window opens, then falls toward the date. 0 on the date |
| Something happened | Renewed: a new date. Used: removed from the shelf |
| When to look again? | When the warning window opens |
| Can it come back? | Only if it can be renewed. Food cannot |

This app exists to test a claim: **a new app needs only a new policy and a skin, with zero changes to the engine.** If building it forces an engine change, the contract has failed and gets fixed.

---

## Why these apps

The three apps decay in three different ways, all run by the same engine:

| | Study Dungeon | Ghosted | Expiry Reaper |
|---|---|---|---|
| Shape of decay | Exponential (half-life) | Straight line | Date-based |
| What slows it | Getting answers right | Staying in touch | Nothing; only renewing helps |
| Coming back | A test of you | A reply from them | Only if renewable |

If one engine can run all three without knowing which is which, it can run most things that fade.

---

## Architecture

```
decay-engine/
  packages/
    engine/              the core: states, policy contract, Triage, Autopsy, forecast, history
    shell/               the shared frame: counters, item card, history, Triage panel, time machine
  apps/
    study-dungeon/       app 1
    ghosted/             app 2
    expiry-reaper/       app 3, the reuse test
  site/                  landing page; one site, one tab per app
  docs/                  design notes and the Kiro log
  .kiro/                 Kiro specs, steering and hooks
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
| Specs | The engine spec (requirements, design, tasks), then one short spec per app |
| Steering | Product, engine boundary, structure, testing, theme and wording, and who writes what |
| Hooks | Run the engine tests when an engine file is saved; scaffold a new decay policy on request |
| Property-based testing | The engine rules listed above |

The decay rules are set by me in the specs. I wrote Study Dungeon's policy by hand; for Ghosted I let Kiro write the policy from the spec's formulas and checked it with the `policy-reviewer` agent and the tests (a documented exception in the authorship steering). Study Dungeon's cause-of-death sentences are hand-written; Ghosted's were written by Claude Code outside Kiro (see the authorship steering). Kiro wrote most of the engine from the spec (types, errors, state derivation, settle, bisection, serialization, storage adapters, checkPolicy, forecast) and their tests, and writes the UI, the app glue and the app tests. I ran the WSL verification and wrote the `DecayEngine` class (tasks 9–19), the Triage selection and the Autopsy analysis, with their tests, and the engine's property-based tests. Triage implements the locked value rule from the product steering; Autopsy reports facts only, and each app writes its own cause-of-death sentences. Each session is recorded in [docs/KIRO_LOG.md](docs/KIRO_LOG.md): what Kiro produced, what was changed by hand, and what went wrong. A full write-up comparing spec-driven work with free-form prompting will be added before submission.

## Build status

- [x] Engine spec: requirements, design, tasks
- [x] Steering and hooks
- [x] Engine and tests
- [x] Study Dungeon
- [ ] Ghosted
- [ ] Expiry Reaper
- [ ] Deployed site with sample data
- [ ] Demo video
- [ ] Kiro write-up

## Running it

You need Node 20.19 or later (22.12+ recommended) and pnpm.

```bash
pnpm install

# Study Dungeon, with hot reload: open the address it prints (http://localhost:5173)
pnpm --filter @decay-engine/study-dungeon dev

# Or the production build, served locally (http://localhost:4173)
pnpm --filter @decay-engine/study-dungeon build
pnpm --filter @decay-engine/study-dungeon preview

# Every check: install, typechecks, the engine, shell and app tests, and the build
bash scripts/check.sh
```

On first open, Study Dungeon offers **Load sample data** (12 facts: 4 alive, 4 weak, 4 dead) or **Start empty**. Everything is saved in this browser's local storage; **Reset all data** clears it.

## Licence

[MIT](LICENSE). Everything stays in your browser. Names and items in the samples are made up.
