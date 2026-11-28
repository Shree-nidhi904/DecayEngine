# Requirements Document

Haunt pass: a visual and interaction upgrade for Ghosted, Study Dungeon and the landing page.

## Introduction

Both apps already show decay in their worlds. This pass makes the world **react**:

- Things visibly die while you drag the time machine.
- The whole scene gets worse as neglect grows.
- Saving something is a moment worth seeing.
- A small guide character tells you, with some mischief, what to do next.

The design rule is "scare me, then make it easy". Every effect carries meaning (decay, death or rescue), and the next action is always clear.

None of this changes `packages/engine/`, a decay policy, or an autopsy-sentence file.

## Glossary

- **Real now**: the held clock time (`realNow` in each `App.tsx`).
- **Preview now**: real now plus the time machine offset (`now`).
- **Crossing**: an item whose shown state at preview now is worse than at real now. *Fades* means alive at real now and weak at preview now. *Dies* means not dead at real now and dead at preview now.
- **Doom**: a number from 0 to 1 that says how bad the world is at preview now: `(weak + 2 × dead) / (2 × total)`, and 0 when there are no items.
- **Doom band**: `calm` when doom < 0.2, `uneasy` when doom < 0.5, otherwise `grim`.
- **Strike**: one lightning flash. A *dark strike* marks a death; a *bright strike* marks a rescue.
- **Guide**: the app's character. Wisp in Ghosted, the Keeper in Study Dungeon.
- **Spooky level**: a setting, `haunted` (the default) or `calm`.

## Requirements

### Requirement 1: Preview crossings

**User story:** As a judge dragging the time machine, I want to see the exact moment things fade and die, so that decay feels real.

1. WHEN the time machine offset is above 0 THEN the app SHALL compute the crossings between real now and preview now with a pure function.
2. WHEN the offset is 0 THEN the set of crossings SHALL be empty.
3. Every item marked *dies* SHALL be not dead at real now and dead at preview now. Every item marked *fades* SHALL be alive at real now and weak at preview now.
4. Each crossed item's window (Ghosted) or card (Study Dungeon) SHALL carry `data-crossed="dies"` or `data-crossed="fades"`. The attribute SHALL be removed when the item no longer crosses.
5. The state SHALL still be shown by light or creature, glyph and word, exactly as before. The crossing only adds motion.

### Requirement 2: Doom

1. The app SHALL compute doom at preview now with a pure function that returns a number from 0 to 1.
2. Doom SHALL be 0 when there are no items. It SHALL never decrease when one more item is dead and the other items are unchanged.
3. The app root SHALL carry `--doom` as an inline CSS variable and `data-doom` as the doom band.
4. Fog, vignette and similar scenery MAY use `--doom`. Text contrast SHALL stay at WCAG AA at every doom value.

### Requirement 3: Lightning

1. WHEN the number of *dies* crossings grows while previewing THEN the app SHALL play one dark strike.
2. WHEN a resurrection or reconnect succeeds THEN the app SHALL play one bright strike.
3. A strike SHALL be a full-screen, `aria-hidden`, pointer-transparent overlay. It SHALL be replayed by remounting with a new key, never with a timer.
4. Under reduced motion, or when the spooky level is `calm`, no strike SHALL be shown.

### Requirement 4: Resurrection ritual

1. WHEN a reconnect (Ghosted) or a challenge (Study Dungeon) succeeds THEN the dialog SHALL show the ritual: a ring of light, rising spirits, then a stamp in words ("Lit again" or "Risen").
2. The dialog's existing result line SHALL keep saying the outcome in words. The ritual art, including the stamp, SHALL be `aria-hidden`, so the outcome is not read twice.
3. Under reduced motion the end state is shown without motion.

### Requirement 5: Guide

1. Each app SHALL show its guide in the hero, with one line from a pure `guideLine(context)` function in `wording.ts`.
2. The context SHALL be: the hero case, whether the time machine is previewing, the doom band, the number of *dies* crossings, and a rotation index that depends only on real now's day.
3. Every line SHALL name the next action, SHALL be at most 120 characters, and SHALL avoid every phrase each app already bans.
4. The guide art SHALL be `aria-hidden`. The line SHALL be plain text that is not live (the existing announcer stays the only live region).

### Requirement 6: Spooky level

1. Each app SHALL have a "Spooky level" toggle button (`aria-pressed`) in its settings with the two values `haunted` and `calm`, saved in localStorage. Storage that throws SHALL leave the value `haunted` and SHALL not crash.
2. The app root SHALL carry `data-spooky`.
3. With `calm`, lightning, the flashlight and the ambient extras SHALL not show. State animations (flicker, death, relight) SHALL stay.

### Requirement 7: Flashlight

1. On a fine pointer, moving the pointer over the scene SHALL set `--px` and `--py` on the scene. The CSS SHALL draw a soft light there.
2. The flashlight SHALL never make text or state unreadable. It SHALL be off under reduced motion and with `calm`.

### Requirement 8: Sound in Ghosted

1. Ghosted SHALL get a sound toggle button (`aria-pressed`), off by default, saved under `ghosted:sound`.
2. Ghosted's sounds SHALL be made with Web Audio oscillators only (no audio files). There are three: `lightOn` (a reach out), `relight` (a reconnect) and `lightOff` (a dark strike).
3. No audio context SHALL be created while sound is off.

### Requirement 9: Share card

1. Each app SHALL offer "Share a card": an image of the world today, made on the device.
2. A pure function SHALL build the card as SVG text with no `url(`, no `http` and no script.
3. Ghosted's card SHALL show no names unless the user ticks "Include first names". Study Dungeon's card SHALL show counts only, never fact text.
4. The download SHALL be a PNG where the browser can draw it, and the SVG otherwise.

### Requirement 10: Screens

Each screen listed in design section 5 SHALL get the upgrade written there. The existing rules still hold: one filled primary per region, 44 px tap targets, the width caps, every colour a design token, all motion inside the reduced-motion block, no `url()`, and no images.

### Requirement 11: Landing page

1. The landing page SHALL show the two apps on one engine in CSS art, and a footer link ("How this was built") to `docs/KIRO_WRITEUP.md`. (Changed in Session 84 at the developer's request: the "Built with Kiro" strip was removed from the page.)
2. It SHALL keep every rule in `scripts/check-site.sh`.

### Requirement 12: Nothing gets weaker

1. No existing test SHALL be weakened, skipped or deleted.
2. `bash scripts/check.sh` SHALL pass.
3. `packages/engine/` SHALL not change.
