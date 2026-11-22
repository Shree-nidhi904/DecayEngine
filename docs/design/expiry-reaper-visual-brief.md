# Expiry Reaper: visual brief

> **Dropped on Nov 22, 2026. Expiry Reaper was not built.** Ghosted is the reuse proof. This brief is kept for the record only.

Written **before** Kiro scaffolds Expiry Reaper. Its job in the project is to prove reuse: the engine and shell must not change at all. The look must still be its own, so it needs this brief from the start.

There is **no wireframe yet**. Make one (outside Kiro, like the other two) before the build, or have Kiro build directly from this brief and record that in the Kiro log. Tokens: `.kiro/steering/design-tokens.md`, Expiry Reaper section.

## The metaphor

A cold kitchen shelf at night, lit by an open fridge. Each item (food, medicine, a document) is a **jar of time**: the liquid level is health, the share of time left before it expires.

| State | Jar | Glyph and word |
|---|---|---|
| Alive | Clear cold liquid, nearly full, a fresh label | circle, "fresh" |
| Weak | Amber liquid, low, label curling | triangle, "expiring soon" |
| Dead | Empty jar, lid off, a rust stain | cross, "expired" |
| Renewed | Fills back up with a cold shimmer | circle, "renewed" |

Liquid height is health. The colour moves from `--cold` to `--amber` to `--rust` with state, never by colour alone.

## Screens and parts (requirements)

1. **Header**: the logo in Special Elite on a fridge-magnet strip, with a tagline such as "Everything has a date".
2. **Hero**: "4 things expire this week", one primary action ("Check the milk"), big counters for fresh, expiring soon and expired.
3. **Triage**: the shared rule, explained in three steps.
4. **Shelves**: three shelves (Still fresh / Expiring soon / Expired). Each item is a jar with a handwritten label (name and date), with the fridge light on the top shelf and a dark cupboard for expired items.
5. **Item card**: jar, name, category (food, medicine or document), "expires 24 Nov", days left, a health bar with weak and dead marks, one primary action ("Renew" or "Used it up"), then quiet Edit and Remove.
6. **Calendar dock**: a tear-off calendar that loses pages as you drag ahead; jars drain as you look forward.
7. **Renew dialog** (resurrect): a new date; the jar refills.

## Lessons from Study Dungeon (apply from the start)

- One filled primary per region; quiet secondary actions.
- Full-width layout, no empty side columns.
- Cheap wow: condensation drops on fresh jars, frost at the shelf edges, a fridge hum light flicker, all motion-safe.
- Focus clear of the fixed dock; the 320px width check; reduced-motion check.
- Reuse import, backup and restore, and today's quick action.

## Done means

- The engine and shell diff is zero lines (the point of this app).
- Jars drain on the right days when you drag the calendar.
- Every state is shown by liquid level, glyph **and** word.
- Tests: liquid height follows health, the expired jar at dead, the 320px check, the reduced-motion check.

## Prompt to paste into Kiro (new spec: "expiry-reaper")

> Create the Expiry Reaper spec from the app template: requirements, design and tasks. Input: #[[file:docs/design/expiry-reaper-visual-brief.md]]. The engine and shell must not change (zero-line diff). Every numbered part in the brief is a requirement with acceptance criteria and a test. Components: Jar, Shelf, CalendarDock, ItemCard. Follow `.kiro/steering/design-tokens.md` and `theme-and-wording.md`.
