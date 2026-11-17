# Authorship and Division of Labor

## What the developer writes (hand-written)

These three pieces are **never generated** by Kiro. They are the developer's creative work:

1. **Decay rules**: The policy functions that define how an item decays and comes back:
   - `thresholds: { weak: number; dead: number }`
   - `init(payload, now)` → policyData
   - `healthAt(item, now)` → number (0-100)
   - `applyEvent(item, event, now)` → { health, policyData }
   - `nextDueAt(item, now)` → timestamp | null
   - `resurrect(item, now)` → Promise<...>

2. **Triage selection logic**: The value calculation and item-picking algorithm. The rule is locked (see `product.md`), but the implementation is hand-written.

3. **Autopsy reasoning**: The cause-of-death analysis that reads the history log and explains why an item died.

## What Kiro writes (generated)

Kiro is used for:

- UI components and layout
- App glue code (connecting the engine to React)
- Tests (unit tests and property-based tests)
- Styling and CSS
- Sample data generation

## Kiro usage log

Every Kiro contribution is logged in `docs/KIRO_LOG.md` using the session format already established in that file. Each session records:

- Goal
- Kiro feature used
- What Kiro produced
- What was changed by hand
- What went wrong or surprised
- Credits used
- Screenshot file names

This log is part of the Kiroween submission and demonstrates how the IDE was used.

