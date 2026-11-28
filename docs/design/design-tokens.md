# Design tokens

Visual rules for every app. Save as `.kiro/steering/design-tokens.md`.

## Shell rules (all apps)

- Dark only. No light theme.
- One display font per app, Spectral for body text, IBM Plex Mono for numbers, labels and buttons.
- State is shown by shape and label as well as colour: alive is a circle, weak is a triangle, dead is a cross.
- Primary action: one per screen region, filled accent colour with a 3px darker bottom edge.
- Cards: 1px border, 6 to 12px radius, hard `0 6px 0 #000` shadow, no blur.
- Respect `prefers-reduced-motion`. All animation sits inside `@media (prefers-reduced-motion: no-preference)`.
- Never rely on hover alone. Everything works with keyboard focus.

## Spacing and type

- Page max width 1080px, side gutter at least 16px.
- Gaps: 8, 12, 16, 20, 24px only.
- Body 17px / 1.5. Labels 11 to 13px mono, uppercase with 0.1 to 0.16em letter spacing.
- Hero heading: clamp(30px, 5vw, 46px).

## Study Dungeon (torch-lit crypt)

```css
:root {
  --bg: #060509;
  --stone: #110d17;
  --stone-hi: #1c1625;
  --line: #2b2235;
  --bone: #f0e6cc;
  --bone-dim: #b0a694;
  --ecto: #9cf26b;      /* alive */
  --pumpkin: #ff8a2b;   /* weak, primary accent */
  --blood: #ff5f77;     /* dead */
  --moon: #a8e6d6;      /* graveyard headings */
  --slate: #a9bde0;     /* crypt headings */
  --display: "Pirata One", Georgia, serif;
  --body: "Spectral", Georgia, serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  --age: 0;             /* 0 to 1, set from the time machine */
}
```

Atmosphere (fixed, `pointer-events: none`): dark overlay `opacity: calc(var(--age) * .32)`, fog, vignette, grain at 8%.

Creature kinds and colours: slime `#9cf26b`, bat `#b48cff`, imp `#ff8a2b`, eye `#4fd8e8`.
Mood rule: weak and health at or above 35 is worried, below 35 is feral, alive is sleep, correct answer is happy.

## Ghosted (night street)

```css
:root {
  --bg: #07060d; --panel: #100e1a; --panel-hi: #1a1727; --line: #2a2640; --bone: #efe9f5; --dim: #aea8c4;
  --glow: #ffd479; --flick: #ff9a4a; --dark: #6d6a86; --sign: #ff7ab8; --rust: #ff7a7a; --mint: #8fe3c4;
  --display: "Josefin Sans", sans-serif; --logo: "Monoton", sans-serif;
}
```

Window lit amount: `--lit = health / 100`. Weak windows flicker. Dead windows are boarded up.

## Thresholds shown everywhere

Weak below 60. Dead below 10. Show both as marks on every health bar.
