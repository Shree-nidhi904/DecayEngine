# Study Dungeon: visual pass brief

Purpose: close the gap between the working app (localhost:5173) and the approved wireframe `docs/design/study-dungeon-wireframe.html`.
Scope: look and feel only. No engine changes, no new features. Every behaviour that works today must keep working.

## What the screenshots show today

Working and worth keeping: sample data, tabs, Add / Edit / Remove, Triage, Play, Autopsy and Challenge buttons, the future-preview banner, disabled actions while previewing, the souls and streak counters.

Missing compared with the wireframe:

| # | Gap | Wireframe has | Built app has |
|---|-----|---------------|---------------|
| 1 | No world | Torch-lit brick chamber, cold crypt, moonlit graveyard, fog, vignette, grain | Flat black page |
| 2 | No monsters | Four creature types with moods (worried, feral, sleeping, happy) | A small icon and the word "monster" |
| 3 | Health is only a number | Health orb, bar with weak and dead marks, "lost since last review", urgency label | "Health 24" |
| 4 | Time machine is a plain panel | Candle that melts, timeline markers, "Next: Gloop weakens in 2d", room ages as you drag | Slider and three buttons |
| 5 | Hero is thin | Logo between torches, one-line forecast, big alive / weak / dead counters | One sentence and chips |
| 6 | Cards lack context | Epitaph, importance, minutes, half-life | Question and health only |
| 7 | Controls have equal weight | One clear primary action | Fight, Edit, Remove look alike |
| 8 | Triage looks unfinished | Result list with creature, why, minutes, "left weak" line | Plain radio group |
| 9 | No motion | Torch flicker, popin, squish, rise, shake | None |

Judges score Design at 20%, and the costume is what makes this app memorable.

## Order of work (each pass is shippable on its own)

### Pass 1: the world (biggest impact)
1. Fixed atmosphere layers: vignette, film grain, fog, a `--age` dark overlay.
2. Header: logo "Study Dungeon" between two flickering torches, tagline "What you forget will come for you".
3. Three scene sections with their own backgrounds: Dungeon (brick wall, wall torches, stone floor), Crypt (cold blue, pillars), Graveyard (moon, stars, tree, ground). Decide: keep tabs, or stack the scenes as in the wireframe. Recommendation: stack on desktop, tabs only below 700px.
4. Heading colours per scene: warm orange, slate blue, moon teal.

### Pass 2: creatures and health
1. `Creature` component: kinds `slime`, `bat`, `imp`, `eye`; moods `worried`, `feral`, `sleep`, `happy`. Port the SVG from the wireframe.
2. Mood rule: weak and health at or above 35 is `worried`, below 35 is `feral`, alive is `sleep`, correct answer is `happy`.
3. `HealthOrb` and `HealthBar` with the weak (60) and dead (10) marks and the hatched "lost" segment.
4. Urgency labels: "Review soon", "Review now", "Nearly forgotten".
5. Card content: name, question, epitaph, importance, minutes, half-life, "alive today" tag in preview.
6. `Tombstone` and `SleepingCoffin` replace the plain cards in Graveyard and Crypt.
7. Make Fight the only primary button. Move Edit and Remove into a quiet secondary row or a menu.

### Pass 3: time machine and motion
1. Fixed bottom dock with the candle (wax melts, drips, flame dims with `--age`).
2. Timeline markers on the slider (weak and dead days, clickable) and the "Next:" line.
3. Hero forecast line: "In 18 days: 4 will weaken, 3 will die."
4. Motion, all behind `prefers-reduced-motion: no-preference`: torch flicker, creature sway and shake, popin on state change, squish on a win, rise on resurrect, shake on a miss.
5. Optional: door splash, sound toggle (off by default).

## Design tokens

See `.kiro/steering/design-tokens.md` (provided alongside this file).

## Rules that must not break

- State is never shown by colour alone: keep the glyph (circle, triangle, cross) and the text label.
- Respect `prefers-reduced-motion`.
- Visible keyboard focus. Dialog traps focus and returns it.
- Text contrast stays readable on the darkest areas.
- The engine package stays untouched: no imports of app or UI code, no clock reads.
- Art is original SVG or CSS only. No third-party assets.

## Done means

- Side by side with the wireframe at 1200px and 390px, the app shows the same world, creatures, orb, dock and hero.
- Dragging the slider ages the room (torches dim, fog and cobwebs appear) and creatures change mood.
- Existing tests still pass. Add snapshot or render tests for `Creature` moods and `HealthBar` marks.

## Prompt to paste into Kiro (create as a new spec: "study-dungeon-visual-pass")

> Create a spec for a visual pass on apps/study-dungeon. Requirements, design and tasks.
> Inputs: #[[file:docs/design/study-dungeon-wireframe.html]] is the approved visual reference, and #[[file:docs/design/study-dungeon-visual-pass.md]] is the brief.
> Do not change packages/engine and do not add features. Keep every current behaviour working.
> Split the work into three passes exactly as in the brief (world, creatures and health, time machine and motion). Each pass must end at a checkpoint where all existing tests pass.
> Port the art and CSS from the wireframe into React components (Creature, HealthOrb, HealthBar, Tombstone, SleepingCoffin, Torch, Candle). Use CSS variables for the design tokens in the steering file.
> Add tests for the Creature mood rule and the HealthBar marks.

## Honest note for the Kiro log

The wireframe was designed outside Kiro. The spec and the code for the visual pass are written by Kiro from it. Record that split in `docs/KIRO_LOG.md`.
