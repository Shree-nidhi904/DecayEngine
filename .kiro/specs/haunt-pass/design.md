# Design Document

Haunt pass for Ghosted, Study Dungeon and the landing page. See `requirements.md`.

## 1. Constraints this design obeys

These come from existing tests and steering:

| Rule | Source |
|---|---|
| Motion is CSS only. No `requestAnimationFrame`, `.animate(`, smooth scroll, or new timers. | `apps/*/src/motion.test.ts` |
| All keyframes sit inside the one `prefers-reduced-motion: no-preference` block. In Ghosted that is `motion.css`; in Study Dungeon it is `animations.css` and `live.css`, and the reduce block there stops every animation. | Same, plus `animations-css.test.tsx`, `live-css.test.ts` |
| Study Dungeon's `dock.css` has no motion. | `layout-css.test.ts` |
| No new colour tokens. Every colour is `var(--token)`, a `color-mix()` of tokens, `transparent`, `currentColor` or `#000`. | `tokens.test.ts`, `global-css.test.ts`, `design-tokens.md` |
| No `url()`, no `<img>`, no images, no new dependencies. | `tokens.test.ts`, `theme-and-wording.md`, `tech.md` |
| Every string lives in `wording.ts`. Ghosted's new exports get a `SAMPLE_CALLS` entry. | `wording.test.ts` |
| One filled primary per region; 44 px targets; width caps (Ghosted 288 px, Study Dungeon 320 px). | `primary-buttons.test.tsx`, `layout-css.test.ts` |

## 2. Shared pure modules

Each app gets its own copy, so neither imports from the other.

### 2.1 `preview-crossings.ts`

```ts
export type Crossing = "fades" | "dies"
export function previewCrossings(before: ReadonlyArray<{id, state}>, after: ReadonlyArray<{id, state}>): Map<string, Crossing>
```

- *dies*: before is not `DEAD`, after is `DEAD`.
- *fades*: before is `ALIVE`, after is `WEAK`.

Items missing from either list are skipped. The App calls it with `engine.view(realNow)` and `engine.view(now)`, only while previewing.

### 2.2 `doom.ts`

```ts
export function doom(states: ReadonlyArray<State>): number   // 0..1
export function doomBand(d: number): "calm" | "uneasy" | "grim"
```

### 2.3 `guide.ts` and `wording.ts`

`guideLine(ctx)` picks a line from the table `guideText` in `wording.ts`. The pool depends on `(case, previewing, band, dies > 0)`; within the pool, the line is chosen by `rotation % pool.length`. Rotation is `Math.floor(realNow / DAY)`, so the line is stable through a day.

### 2.4 `spooky-level.ts`

`readSpooky(storage)` and `writeSpooky(storage, level)`. Keys: `ghosted:spooky`, and `study-dungeon:spooky` for Study Dungeon. Any throw reads as `haunted`.

### 2.5 `share-card.ts`

A pure `shareCardSvg(data)` returns SVG text. `downloadCard(svg, name)` in the component draws it to a canvas, falls back to the SVG, and uses the app's existing download helper.

### 2.6 Strike

`Lightning` component: `<div class="fx-lightning" data-kind="dark|bright" key={n} aria-hidden>`. The App keeps a `strike` state `{n, kind}`:

- When the *dies* count grows while previewing, `n + 1` with dark.
- After a successful reconnect or challenge, `n + 1` with bright.
- When `n` is 0 nothing renders. It always unmounts through `onAnimationEnd`.

## 3. Ghosted screens

| Screen | Upgrade |
|---|---|
| App root | `--doom`, `data-doom`, `data-spooky`; `Lightning` overlay. |
| Street | Sky with stars and a moon glow above the houses. Fog opacity follows `--doom`. Flashlight overlay (`.gh-flashlight`, uses `--px/--py`). A drifting ghost when someone is dark. Windows carry `data-crossed`: *dies* plays `gh-die` (flicker, flare, slam dark, dust); *fades* plays `gh-fade` (a stutter). Hover/focus leans the window in. `relitId` is passed after a reconnect. |
| Hero | Wisp (SVG ghost, floats, droops when grim) with the guide line in a bubble. A Street pulse EKG line whose beat speeds up with doom, labelled in words. |
| Neon sign | One letter is loose and stutters (wrapped spans, aria-hidden copy; the h1 text is unchanged for screen readers). |
| Splash | Stars and a moon rise before the windows light; a rising glow behind "Walk in". |
| Person card | The health bar gets a glowing filament (glow from `--lit`); dead cards get a cobweb corner. |
| Reach out | A Window previews the freshness of the focused or hovered choice, then plays the light-on sound. |
| Reconnect | Ritual: ring, rising spirits, "Lit again" stamp; bright strike; relight sound. |
| Moon dock | The moon gets a blood tint as doom rises. |
| Toast | A death toast shakes once. |
| Settings | Sound switch, Spooky level switch, Share a card. |

## 4. Study Dungeon screens

| Screen | Upgrade |
|---|---|
| World | `--doom`, `data-doom`, `data-spooky`; doom deepens the vignette and fog; `Lightning`; flashlight; dripping water. |
| Hero | The Keeper (lantern skull SVG) with the guide line; the boss scales with doom. |
| Lists and cards | Cards carry `data-crossed`: a sleeper jolts awake (*fades*); a monster sinks and greys (*dies*). |
| Challenge | Ritual: rune ring, rising spirits, "Risen" stamp; bright strike. |
| Fight | Critical hit (a right answer within 5 s, measured from timestamps): a "Critical!" stamp. |
| Session done | Victory banner with a chest, plus Share a card. |
| Settings | Spooky level switch, Share a card. |

## 5. Landing page

A CSS-art hero: a dungeon door on the left, a lit street on the right, the engine core glowing between them. A "Built with Kiro" strip with counts and repo links. No script, no remote assets.

## 6. Testing

- Property tests for `previewCrossings` and `doom` (`numRuns` ≥ 100).
- Example tests for `guideLine` (every pool is non-empty; length; banned words; contains an action word).
- Example tests for `shareCardSvg` (no `url(`, no `http`, no names unless asked).
- Spooky-level read and write, including storage that throws.
- Component tests: scrubbing past a death puts `data-crossed="dies"` on that window or card, and returning to today removes it.
- The existing CSS tests (motion, tokens, contrast, layout) keep passing with the new selectors inside their rules.
