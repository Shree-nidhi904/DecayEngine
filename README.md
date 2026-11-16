# Decay Engine

**One engine for things that fade, die, and can be brought back.**

Built for [Kiroween 2026](https://kiroween.devpost.com/) in the **Skeleton Crew** category: one reusable foundation, shown with separate apps built on top of it.

> **Status: in development.** This README describes the design. Nothing is deployed yet. Setup steps, the live URL, the demo video and screenshots will be added as each part lands. See [Build status](#build-status).

---

## The problem

Some things get worse quietly when nobody is looking at them.

- A fact you studied last month is half gone today.
- A link you put in your documentation two years ago now points to a missing page.
- The milk in the fridge and the passport in the drawer both have a date you are not tracking.

These look like different problems, but they have the same shape:

1. The thing starts healthy.
2. It loses health, either as time passes or when something goes wrong.
3. If nobody acts, it dies.
4. Sometimes it can be brought back.

Today, each of these is solved by a separate app that rebuilds the same logic from scratch: health tracking, "what needs attention now", a list of dead things, a history of what happened. Decay Engine writes that logic once.

## What Decay Engine is

Decay Engine is a small TypeScript library. It tracks the life of any item:

```
ALIVE  (health 100 to 60)
  ↓
WEAK   (health 59 to 1)     ← needs attention
  ↓
DEAD   (health 0)           ← moved to the graveyard
  ↓
RESURRECTED                 ← back to ALIVE
```

The engine does not know what an item is. It does not know about studying, links or food. An app plugs in by answering four questions:

| Question | In code |
|---|---|
| How healthy is this item right now? | `healthAt(item, now)` |
| Something happened to it. What is its health now? | `applyEvent(item, event, now)` |
| When should I look at it again? | `nextDueAt(item, now)` |
| Someone wants to bring it back. Did it work? | `resurrect(item)` |

These four functions are called a **decay policy**. Write one policy and you have a new app.

In return the engine gives every app the same tools:

| Function | What it does |
|---|---|
| `addItem` | Start tracking a new item |
| `tend(id, event)` | Record that something happened to an item |
| `tick(now)` | Recalculate health for everything and move items between states |
| `due(now)` | List the items that need attention now |
| `graveyard()` | List the dead items |
| `resurrect(id)` | Try to bring a dead item back |
| `history(id)` | Show everything that ever happened to an item |

**The rule that keeps it honest:** the engine never imports an app. If an app needs the engine changed, the policy contract is wrong, and the contract gets fixed instead.

## The time machine

Decay is slow. Nobody wants to wait three weeks to see whether an app works.

Every engine function takes the current time as an input instead of reading the clock. So each app has a **time slider**: drag it forward 30 days and watch items weaken and die in seconds. Drag it back and they recover.

It is useful for three things: seeing what your future looks like if you do nothing, testing a decay policy quickly, and showing the engine working in a short demo.

---

## App 1: Link Cemetery

**Who it is for:** anyone who maintains a page full of links, such as documentation, a blog, a README or a reading list.

**What it solves:** links break over time and the page owner rarely finds out. Readers hit a dead end. Link Cemetery finds the dead links and offers a saved copy from the Internet Archive.

**How it uses the engine:** a link does not decay on its own. Its health changes only when it is checked.

| Policy question | Link Cemetery's answer |
|---|---|
| What is an item? | One link: its URL and the page it was found on |
| Health right now | Whatever the last check left it at |
| What an event does | Check passed: health 100. Check failed: health drops by 50 |
| When to look again | Later for healthy links, sooner for weak ones |
| Resurrect | Look for an archived copy of the page. Success if one exists |

### What happens, step by step

**You scan a page.**
You paste the address of a page. A small server-side function fetches the page, pulls out every link and checks each one. (A browser is not allowed to check other websites directly, which is why this one step runs on a server.) Each link becomes an item in the engine at full health.

**A link fails once.**
Its health drops to 50, so it becomes WEAK. It shows as a cracked headstone. One failure might be a temporary outage, so the link is not declared dead. It is scheduled for an earlier re-check.

**The link recovers.**
The next check passes. Health returns to 100 and the crack disappears.

**The link fails twice.**
Health reaches 0. The link is DEAD and gets a tombstone in the cemetery, showing the URL, the page it was on and the date it died.

**You resurrect a link.**
You click a tombstone. The app asks the Internet Archive whether it holds a saved copy of that page. If it does, the link is resurrected: you get the archived address to use as a replacement. If no copy exists, the tombstone stays and says so.

**You come back next month.**
The due list shows which links need a re-check. You run the scan again. The history of each link shows every check and result, so you can tell a link that broke yesterday from one that has been flaky for months.

---

## App 2: Study Dungeon

**Who it is for:** anyone learning facts they need to keep, such as exam material, vocabulary or interview prep.

**What it solves:** people forget most of what they study unless they review it at the right time. Review too early and you waste time. Review too late and the fact is gone. Study Dungeon tells you exactly which facts are about to slip away, and makes reviewing them a short game.

**How it uses the engine:** a fact decays with time, even if nothing happens to it.

| Policy question | Study Dungeon's answer |
|---|---|
| What is an item? | One fact: a question and its answer |
| Health right now | Drops by half every *half-life* since the last review |
| What an event does | Correct answer: health back to 100 and the half-life doubles. Wrong answer: health drops and the half-life halves |
| When to look again | The moment health is predicted to fall below 60 |
| Resurrect | Win the fight: answer the question correctly |

The half-life is how long a fact takes to lose half its health. A fact you keep getting right earns a longer half-life, so you see it less often. A fact you keep missing comes back sooner.

### What happens, step by step

**You add facts.**
You start with a deck of questions and answers. Each fact is an item at full health with a short half-life.

**You do nothing for a while.**
Health falls as time passes. When a fact drops below 60 it becomes WEAK and appears in the dungeon as a monster.

**You fight a monster and win.**
You are shown the question and answer it correctly. The monster is defeated, the fact returns to full health, and its half-life doubles. It will take twice as long to come back.

**You fight a monster and lose.**
You answer wrongly. The fact loses health and its half-life is cut in half, so the monster returns sooner.

**You ignore a fact for too long.**
Health reaches 0. The fact is DEAD and moves to the graveyard. It is no longer in your normal review queue.

**You resurrect a fact.**
You visit the graveyard and challenge a dead fact. Answer correctly and it comes back to life with a short half-life, as if newly learned.

**You use the time machine.**
You drag the slider forward two weeks. The dungeon fills with the monsters you will face if you stop studying today.

---

## App 3: Expiry Reaper (the reuse test)

**Who it is for:** anyone tracking things with an end date, such as food, medicine, subscriptions or documents.

Each item has an expiry date. Health is the share of time left. Tending means "used it" or "renewed it".

This app exists to test a claim: **a new app needs only a new policy, with zero changes to the engine.** If building it forces an engine change, the contract has failed and gets fixed.

---

## Why two such different apps

The two main apps were chosen because they decay in opposite ways.

| | Study Dungeon | Link Cemetery |
|---|---|---|
| What causes decay | Time passing | A failed check |
| Health between events | Keeps falling | Stays the same |
| Resurrect is | A test of the user | A lookup on an outside service |
| Needs a server | No | Yes, for checking links |

If one engine can run both without knowing which is which, it can run most things that fade.

---

## Architecture

```
decay-engine/
  packages/
    engine/              the core: states, policy contract, due queue, graveyard, history
  apps/
    link-cemetery/       app 1
    study-dungeon/       app 2
    expiry-reaper/       app 3, the reuse test
  server/                the link-checking function
  .kiro/                 Kiro specs, steering and hooks
  reports/               planning notes and hackathon research
```

How the pieces talk to each other:

```
        the app                          the engine
  ┌──────────────────┐   policy    ┌──────────────────────┐
  │ what an item is  │ ──────────▶ │ health and states    │
  │ how it decays    │             │ due queue            │
  │ how it revives   │ ◀────────── │ graveyard            │
  │ how it looks     │   results   │ history              │
  └──────────────────┘             └──────────────────────┘
                                             │
                                          storage
```

Planned technology:

| Part | Choice |
|---|---|
| Engine | TypeScript, no UI code, time passed in as an input |
| Tests | Unit tests plus property-based tests of the engine rules |
| Apps | React |
| Storage | The browser's local storage, so there are no accounts and no login |
| Link checking | One serverless function |
| Archived copies | The Internet Archive's public availability lookup |

Engine rules that the property-based tests will check:

- Health is always between 0 and 100.
- A dead item never appears in the due list.
- A successful resurrect always returns the item to ALIVE.
- Asking for health twice at the same moment gives the same answer.

## How Kiro is used

The project is built with [Kiro](https://kiro.dev). The `.kiro/` folder is committed on purpose.

| Kiro feature | Planned use |
|---|---|
| Specs | One for the engine contract and one for each app: requirements, design, tasks |
| Steering | Naming, visual theme, and the rule that the engine never imports an app |
| Hooks | Run the engine tests whenever an engine file is saved |
| Property-based testing | The engine rules listed above |

A full write-up of what Kiro did, what was written by hand and how spec-driven work compared with free-form prompting will be added here before submission.

## Build status

- [ ] Engine and tests
- [ ] Time machine
- [ ] Link Cemetery
- [ ] Study Dungeon
- [ ] Expiry Reaper
- [ ] Deployed site
- [ ] Demo video
- [ ] Kiro write-up

## Running it

Setup instructions will be added when the first code lands.

## Licence

[MIT](LICENSE)
