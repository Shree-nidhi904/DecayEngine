# Developer feedback list (28 Nov 2026) and decisions

The developer's 24 points, word for word in meaning, with the decisions made in the IDE chat (Sessions 84 to 86). Steps group the points. Kiro CLI checks everything at the end (tests, typecheck, browser).

## The points

1. The landing page could look better and more impressive.
2. Remove the "Built with Kiro" strip and Kiroween mentions from the landing page.
3. Policy Lab is not understandable for non-coders. **Decision: (a)** remove it from the landing page, keep it in the repo as a developer tool.
4. Life Triage's description and limits are too complicated; "Value kept 239… exact, not greedy" is not understandable.
5. Life Triage: how does it know which app a backup is from? Why only one upload? Which files are accepted? **Decision:** one box per app (`.json`); the file says which app it is from, so a file in the wrong box still loads as its own app, with a note. One pick can hold both files.
6. Life Triage "Do these" rows need a link to the app to do the task. **Decision:** `Open in <app>` links to `<app>/?tend=<id>`. Each app opens that item (fight dialog in Study Dungeon, reach out in Ghosted). **If the id is not found** (another device, removed): the app opens normally and says "That item is not on this device."
7. Study Dungeon: a profile icon top right (sync across devices), and a Settings window for sound, notifications, backup, restore, spooky level, memory model and reset, instead of everything at the bottom.
8. Time machine bar: "Coming up" should sit at the bottom, not the middle.
9. The side margins are empty; fill them. **Decision (Kiro's):** scenery that follows the world (Study Dungeon: wall torches and chains; Ghosted: far houses and trees), `aria-hidden`, shown only on wide screens, CSS only.
10. After answering, the page scrolls and the dialog is not focused; on reopening, the page is not at the top. **Decision:** turn off the browser's scroll restoration and start at the top; the fight dialog keeps focus on its own result and never scrolls the page behind it.
11. "Fight the weakest" should show all the weak cards. **Decision:** it opens the Dungeon list (all weak facts) and starts a run through every weak fact, weakest first.
12. The Triage button does nothing because Triage is already automatic. **Decision:** remove the button; the picks show as soon as a budget is chosen.
13. Importance and review cost need an (i) explanation next to each field.
14. "Share a card" should be an image of the three counters (Crypt, Dungeon, Graveyard).
15. The memory model is hard to understand. **Decision:** plain words, plus a small worked example ("next time it lasts about N days"). The rules and constants do not change (they are the developer's).
16. "Back to today" belongs on the time machine bar; no × or warning icons there.
17. Sync: after the first sign-in it should sync by itself. Once signed in, the top-right button becomes "Profile" and shows the activity history: what changed when. **Decision: every synced device.** No new table: sync already merges the engine's history log, so the history in the profile is the engine's history after sync, which holds every device's events. Auto-sync already runs every 2 minutes and on focus once signed in (`browserAutoSync`).
18. "Backup downloaded. Keep the file somewhere safe." stays on screen. **Decision:** a toast at the bottom right with a 5-second bar, then it closes.
19. Improve the background. **Decision (Kiro's):** a deeper layered background (Study Dungeon: stone wall texture and warm light from below; Ghosted: night sky with stars and a far skyline), CSS only.
20. A home icon next to the profile, going to the landing page (`https://decay-engine.pages.dev/`).
21. Everything for Study Dungeon that is common applies to Ghosted too (7, 8, 9, 10, 12, 13, 16 to 20).
22. Ghosted's moon-clock bar needs a Play button that plays time forward, and a Back to now button. **Decision:** Back to now sets the time machine back to the real clock (offset 0), the same as Study Dungeon's Back to today.
23. Ghosted: show the three lists (Fading, Empty windows, Still lit) one at a time, as tabs; remove the Street button.
24. Ghosted: "Import people" and "Add a person" feel the same; keep only "Add a person".

## Steps

| Step | Points | State |
|---|---|---|
| 1 Landing page | 1, 2, 3 | Done (Session 84) |
| 2 Life Triage | 4, 5, 6 (page side) | Done (Session 85, tests passed in Kiro CLI) |
| 3 Frame in both apps | 7, 17, 18, 20, 21 | Done. Study Dungeon: Session 87. Ghosted: Session 86 |
| 4 Time bar | 8, 16, 22 | Done. Study Dungeon: Session 88; "Coming up" moved after the time machine in the markup in Session 89, so the focus order matches the screen. Ghosted: Session 86 |
| 5 Study Dungeon | 6 (app side), 10, 11, 12, 13, 14, 15 | Done (Sessions 87 and 88) |
| 6 Ghosted | 6 (app side), 12, 13, 23, 24 | Done (Session 86; tests run and old-layout tests updated in Kiro CLI, Session 89) |
| 7 Background and margins | 9, 19 | Done. Study Dungeon: Session 88. Ghosted: Session 86 |

Tests: shell 171, Study Dungeon 912, Ghosted 1112, all passing; typecheck clean; `check-engine-unchanged.sh` passes (shell autoRun recorded as Ghosted Requirement 41). Preview deploys: Session 89. No Playwright check is planned: the developer looks at the preview sites in the browser.

## Who does what (from Session 86/87)

- **Ghosted** (`apps/ghosted/`): the IDE, Session 86. Typechecked, run and its old-layout tests updated in Kiro CLI, Session 89.
- **Study Dungeon** (`apps/study-dungeon/`): Kiro CLI, Session 87 onwards.
- **Shared**: `packages/shell` `TriagePanel` has a new optional `autoRun` prop (Session 86) for point 12; Both apps use it.
