# Product

## What it is

Decay Engine is **a hospital for the things in your life**.

A small TypeScript engine tracks the lifecycle of any item: ALIVE → WEAK → DEAD → RESURRECTED. The engine does not know what an item is; each app supplies a **decay policy** that answers six questions.

## Who it's for

- Developers who want to build decay-style apps without writing the lifecycle engine from scratch
- Learners who want spaced repetition that feels like a dungeon crawler
- Anyone trying to stay in touch without losing track of who matters

## Core promise

**An app is a policy plus a skin. The engine never needs to change for a new app.**

A policy defines how something decays and how it revives. A skin defines what it looks like and what it's called. That's it.

## Proof apps

- **Study Dungeon**: Facts you're forgetting come back as monsters. Decay is caused by time passing without review. Defeat them by answering right.
- **Ghosted**: A street of windows. The light shows connection freshness (not "how much someone cares"). Fades as days pass without contact. Comes back when they reply.
- **Expiry Reaper**: Food, medicine, and documents as jars of time. Fades as the expiry date gets close. Exists only to prove reuse with zero engine changes.

## Feature tiers

### Must (core deliverable)
- Lifecycle engine with history log
- **Triage**: "I have N minutes. What should I save?" Picks weak items worth saving first using value per minute.
- **Autopsy**: Cause-of-death report built from the history log.

### Should
- **Crystal Ball**: Forecast of what dies in 7/30/90 days (nearly free with the time machine slider).
- **Epitaphs**: One line on why an item matters, shown on its tombstone.

### Could (only if ahead of schedule)
- Contagion (one weak item makes others decay faster)
- Revival debt (resurrecting costs something)
- Calendar export

### Cut first (polish, not proof)
- Ambient sound effects
- Permadeath mode
- Tombstone cards you can share
- Apps-as-data (policy JSON config)

## Triage rule (locked)

The rule is the same in every app. The engine never judges what matters; the user does.

**Value of tending an item** = (100 − health) × (1 − health ÷ 100) × importance

Where:
- **health** is 0-100 (the engine provides this)
- **importance** is 1-3, set by the user per item (an item field, not a policy function)
- **costMinutes** is the minutes it takes to tend the item (an item field, not a policy function)

Triage picks the set with the best value per minute that fits the time budget.

## The engine's job

- Track health and states (alive, weak, dead, resurrected)
- Maintain due queue and graveyard
- Run Triage and build Autopsy reports
- Accept time as `now` (never read the clock)
- Never import an app

## The policy's job

Answer six questions:

1. **What thresholds define weak and dead?** `thresholds: { weak: number; dead: number }`
2. **How do you initialize an item?** `init(payload, now)` → policyData
3. **How healthy is it now?** `healthAt(item, now)` → number (0-100)
4. **Something happened. What now?** `applyEvent(item, event, now)` → { health, policyData }
5. **When to look again?** `nextDueAt(item, now)` → timestamp | null
6. **Can it come back?** `resurrect(item, now)` → Promise<{ ok, payload?, policyData? } | { ok: false, reason }>

All policy functions are pure and synchronous except `resurrect`, which is asynchronous. The policy's `healthAt` must never increase with time between events.

**Source of truth:** `.kiro/specs/engine/requirements.md` (Type Contract section)

