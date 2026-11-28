# Implementation Plan: Haunt pass

Written before the code. No task touches `packages/engine/`, a `policy.ts`, `policy-memory.ts` or an `autopsy-sentences.ts`. Commands follow `shell-commands.md`, and tests follow `no-fake-tests.md`.

**Status (27 Nov 2026):** all tasks below are done and their tests pass. `bash scripts/check.sh` passes every step except `test life-triage`: its seeded "generator coverage" property test (`packages/life-triage/src/life-triage.property.test.ts`) fails at commit `fcf7a91`, before this pass, and this pass changes nothing that package imports. It is left for the developer. Not done from the design: the autopsy "case file" restyle and the Raid board (left out because their CSS is pinned by existing contrast tests). Three existing tests caught real conflicts and the code changed to meet them, not the tests: the notify tests expect one `role="switch"` on the page (so the new settings are `aria-pressed` buttons), the page order toolbar → notify → privacy (so the settings sit above the toolbar), and the hero's loss line straight before its buttons (so the pulse sits after them).

## Tasks

- [x] 1. Ghosted mechanics
  - [x] 1.1 `preview-crossings.ts`, `doom.ts`, `spooky-level.ts`, `guide.ts` and their tests (property tests for crossings and doom)
    - _Requirements: 1.1-1.3, 2.1-2.2, 5.1-5.3, 6.1_
  - [x] 1.2 `sound.ts` (copied from Study Dungeon, Ghosted recipes) and `SoundToggle`, off by default
    - _Requirements: 8_
  - [x] 1.3 App wiring: `--doom`, `data-doom`, `data-spooky`, crossings to Street, `Lightning`, strike on deaths and reconnects
    - _Requirements: 1.4, 2.3, 3, 6.2_
- [x] 2. Ghosted screens
  - [x] 2.1 Street: sky, doom fog, flashlight, ghost, crossings motion, window lean, `relitId`
  - [x] 2.2 Hero: Wisp, guide line, Street pulse
  - [x] 2.3 Neon sign loose letter and splash sky
  - [x] 2.4 Reconnect ritual, Reach out live window, sounds
  - [x] 2.5 Card filament and cobweb, dock blood moon, death toast shake
  - [x] 2.6 Settings: Spooky level switch
    - _Requirements: 4, 5, 6, 7, 10_
- [x] 3. Study Dungeon mechanics and screens
  - [x] 3.1 Same pure modules and tests
  - [x] 3.2 World doom, lightning, flashlight, dripping water
  - [x] 3.3 Keeper guide in the hero
  - [x] 3.4 Card crossings
  - [x] 3.5 Challenge ritual, critical hit
  - [x] 3.6 Spooky level switch
    - _Requirements: 1-7, 10_
- [x] 4. Share cards in both apps
  - _Requirements: 9_
- [x] 5. Landing page
  - _Requirements: 11_
- [x] 6. Records and checks: `authorship.md`, the README, `bash scripts/check.sh`
  - _Requirements: 12_
