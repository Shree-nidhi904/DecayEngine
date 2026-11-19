# Ghosted: visual brief

Written **before** Kiro builds Ghosted, so the look is part of the spec from day one. Study Dungeon's spec described only behaviour, and the first build came out as a plain list. This brief exists so that does not happen twice.

Reference: `docs/design/ghosted-wireframe.html` (designed outside Kiro). Tokens: `.kiro/steering/design-tokens.md`, Ghosted section.

## The metaphor

A quiet street at night. Each person is a window. **The light is connection freshness**, never "how much someone cares" (`theme-and-wording.md`).

| State | Window | Glyph and word |
|---|---|---|
| Alive | Lit warm yellow; a silhouette inside | circle, "lit" |
| Weak | Orange, flickering | triangle, "flickering" |
| Dead | Boarded up, dark | cross, "boarded up" |
| Resurrected | Lights back on with a brief warm flash | circle, "lit again" |

Light amount is `--lit = health / 100`. Background, glow and silhouette opacity all read `--lit`.

## Screens and parts (requirements, not decoration)

Write each of these into `requirements.md` as an acceptance criterion with its own test.

1. **Splash**: windows light up one by one, then the "Ghosted" neon sign (Monoton). Once per tab; skipped under reduced motion.
2. **Header sign**: the logo as a neon sign with a slow hum flicker.
3. **Hero**: what needs attention ("3 windows are flickering"), one primary action ("Reach out to Mira"), big counters for lit, flickering and boarded up.
4. **Triage panel**: the same engine rule, explained in three steps, with today's 5-minute action.
5. **The Street**: an overview of houses, each person a window on a house, with a legend. Clicking a window opens that person.
6. **Fading / Empty windows / Still lit**: the three lists as plots, each with its own lighting.
7. **Moon-clock dock**: fixed at the bottom. The moon moves across the sky as you drag ahead (up to a year), and windows dim as the street "ages". Markers for when people fade or go dark.
8. **Person card**: name, relationship tag, "last contact 23 days ago", usual rhythm, window with its light, a health bar with weak and dead marks, one primary "Reach out" button, then quiet Edit and Remove.
9. **Reconnect dialog** (resurrect): the boarded window, then boards fall away and the light returns on success.
10. **Privacy line**: "Everything stays in this browser. Names here are made up."

## Lessons from Study Dungeon (apply from the start)

- **One primary action per region.** Filled accent with a darker bottom edge; everything else outlined or quiet.
- **Answer honesty.** Ghosted has no quiz, but "Reach out" must log a real action (for example "Sent a message" or "Had a call"), not a free checkbox.
- **No empty columns.** Full-width layout; nothing beside dead space.
- **Particles and light are cheap wow:** moths around lit windows, fog on the street, a passing car's headlights. All inside `prefers-reduced-motion: no-preference`.
- **Keep focus clear of the fixed dock** (`scroll-padding-bottom`), and focus the dialog content, not a button, when a dialog opens.
- **Unique names**: sample people are fictional and never repeat.
- **Back up, restore and import** come free from the shared pattern; reuse them.

## Wording rules

- Say "connection freshness", "fading", "went dark". Never "doesn't care", "ignored you", "ghosted you".
- Sample names must be fictional.

## Done means

- Side by side with the wireframe at 1280px and 390px: same street, windows, sign, dock.
- Dragging the moon dims the street; windows flicker, then board up, on the right days.
- Every state is shown by light, glyph **and** word.
- Tests: window light follows health (`--lit`), the boarded state at dead, the mood and wording rules, the 320px width check, the reduced-motion check.

## Prompt to paste into Kiro (new spec: "ghosted")

> Create the Ghosted spec: requirements, design and tasks. Inputs: #[[file:docs/design/ghosted-wireframe.html]] is the approved look and #[[file:docs/design/ghosted-visual-brief.md]] is the brief. Every numbered part in the brief is a requirement with acceptance criteria and a test, not a later polish task. Reuse the engine and shell unchanged; the policy is hand-written by the developer. Port the art from the wireframe into React components (Window, House, Street, NeonSign, MoonDock, PersonCard). Follow `.kiro/steering/design-tokens.md` and `theme-and-wording.md`.
