# Project Structure

```
packages/engine/       engine and policy test kit
packages/shell/        shared frame: hero, counters, item card, history, 
                       autopsy, Triage panel, time machine
apps/study-dungeon/
apps/ghosted/
apps/expiry-reaper/
site/                  landing page; one site, one tab per app
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

