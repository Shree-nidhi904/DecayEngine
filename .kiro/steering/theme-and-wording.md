# Theme and Wording

## Visual theme

Dark, calm, readable. Spooky elements must support the function, not decorate.

Each app has its own metaphor:
- **Study Dungeon**: Candle/monster = health
- **Ghosted**: Lit window = connection freshness
- **Expiry Reaper**: Jar of time

Show decay in the world first (creature, orb, candle, the room aging). A health bar is allowed alongside, never alone, and it always shows the weak and dead marks. See `design-tokens.md` and `docs/design/study-dungeon-visual-pass.md`.

## State thresholds

Each policy sets its own weak and dead thresholds (defined in the policy's `thresholds` field). Do not hard-code 100-60 / 59-1 / 0.

State is derived from health:
- **alive**: health ≥ weak threshold
- **weak**: dead threshold ≤ health < weak threshold
- **dead**: health < dead threshold

## Lifecycle vocabulary

Used in code and UI:
- **alive**
- **weak**
- **dead**
- **resurrected** (brought back from dead)

Use **tend** for acting on an item.

## List names per app

The three lists (alive/weak/dead) have different names in each app:

| App | Alive list | Weak list | Dead list |
|-----|------------|-----------|-----------|
| Study Dungeon | Crypt | Dungeon | Graveyard |
| Ghosted | Still lit | Fading | Empty windows |
| Expiry Reaper | Still fresh | Expiring soon | Expired |

## Typography

### Shared fonts (all apps)
- **Body text**: Spectral (Google Fonts)
- **Numbers and code**: IBM Plex Mono (Google Fonts)

### Display fonts (per app)
- **Study Dungeon**: Pirata One (Google Fonts)
- **Ghosted**: Monoton + Josefin Sans (Google Fonts)
- **Expiry Reaper**: Special Elite (Google Fonts)
- **Home page**: Cormorant SC (Google Fonts)

All fonts are open-licensed through Google Fonts.

## Color palettes

Each app has its own palette:

### Study Dungeon
```css
--bg: #060509;
--stone: #110d17;
--stone-hi: #1c1625;
--line: #2b2235;
--bone: #f0e6cc;
--bone-dim: #b0a694;
--ecto: #9cf26b;
--pumpkin: #ff8a2b;
--blood: #ff5f77;
--moon: #a8e6d6;
--slate: #a9bde0;
```

### Ghosted
```css
--bg: #07060d;
--panel: #100e1a;
--panel-hi: #1a1727;
--line: #2a2640;
--bone: #efe9f5;
--dim: #aea8c4;
--glow: #ffd479;
--flick: #ff9a4a;
--dark: #6d6a86;
--sign: #ff7ab8;
--rust: #ff7a7a;
--mint: #8fe3c4;
```

### Expiry Reaper
```css
--bg: #05090b;
--panel: #0e1a1f;
--panel-hi: #15262d;
--line: #2f5058;
--text: #eef4f2;
--dim: #a3b8b8;
--acc: #7ff0e0;
--on: #03211e;
--good: #7ff0e0;
--warn: #ffb85c;
--bad: #ff6f61;
```

### Home page (neutral chalk-on-slate)
```css
--bg: #08090d;
--panel: #10131a;
--panel-hi: #1a1f2b;
--line: #2a3140;
--bone: #ecebe4;
--dim: #a9afbd;
--chalk: #d9e3ef;
```

## Visual rendering

**CSS and SVG only.** No images, no icon libraries, no third-party assets.

## Interface text

Plain and short. No jargon.

## Wording rules

- **Ghosted** must say "connection freshness", never "how much someone cares". The engine does not judge relationships.
- Use fictional names in sample data and the demo video.

## Accessibility

- Keyboard usable
- Readable contrast (check against WCAG AA)
- Respect `prefers-reduced-motion` settings (animations off if requested)
- Never show state by color alone (use icons + text)

## Assets

Only original or openly licensed assets and fonts. No third-party logos.

