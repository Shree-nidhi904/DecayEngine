# Project Structure

```
packages/engine/       engine and policy test kit
packages/shell/        shared frame: hero, counters, item card, history, 
                       autopsy, Triage panel, time machine
packages/insight/      replay and what-if, on the engine's public API (task E1)
apps/study-dungeon/
apps/ghosted/
site/                  landing page: static HTML and CSS, one page, links both apps (task P3)
docs/                  logs and guides
```

## Shared shell components

The shell (`packages/shell/`) provides:
- Hero section (what needs attention)
- Three counters (alive/weak/dead)
- Item card layout
- History log viewer
- Autopsy panel
- Triage panel
- Time machine slider

Each app supplies its own skin (colors, fonts, wording) and policy (decay rules).

## No backend

There is no `server/` folder and no `templates/` folder. Static sites on Netlify, one per app (each app has its own `netlify.toml`).

