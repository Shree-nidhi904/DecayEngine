# Implementation Plan: Study Dungeon

## Overview

Study Dungeon is a spaced-repetition study app built on the Decay Engine. Facts decay exponentially based on their half-life; correct answers double the half-life and restore full health, wrong answers halve it and drop health to 45. This plan builds the app as a vertical slice: Vite + React setup, policy implementation, core UI (add fact, three lists, fight), time machine, triage, autopsy, first run flow, stats, and polish.

**All app tasks depend on the engine package being built (packages/engine must be completed first).**

The implementation follows the authorship rules: the policy functions (init, healthAt, applyEvent, nextDueAt, resurrect) and autopsy cause-of-death sentences are HAND-WRITTEN by the developer; Kiro generates only the tests for those modules, plus all UI components, app glue code, and styling.

## Tasks

- [x] 1. Set up Vite + React app structure
  - Create `apps/study-dungeon/` directory
  - Set up `package.json` with React 18, Vite, TypeScript, and `@decay-engine/engine` as dependency
  - Create `tsconfig.json` extending workspace base config with strict mode
  - Create `vite.config.ts` for app configuration
  - Create `src/main.tsx` entry point
  - Create `src/index.html` with Study Dungeon title and Google Fonts links (Pirata One, Spectral, IBM Plex Mono)
  - Create `src/App.tsx` root component with basic structure
  - Add `dev`, `build`, `preview` and `test` scripts to package.json
  - Create `packages/shell/` as a workspace package (`@decay-engine/shell`): `package.json`, `tsconfig.json`, `src/index.ts`, `src/types.ts` (Theme and Wording prop types). React is a peer dependency. The shell never imports an app and never imports app types
  - Add `@decay-engine/shell` as a dependency of the app
  - Verify app runs with `pnpm dev`
  - _Requirements: all (foundation), 16_

- [x] 2. Implement Study Dungeon Policy (HAND-WRITTEN BY DEVELOPER: Kiro writes only the tests)
  - [x] 2.1 Create policy implementation (WRITTEN BY THE DEVELOPER; originally planned as hand-written)
    - Create `src/policy.ts`
    - Define `FactPayload`, `FactPolicyData`, `ReviewEvent` types
    - Implement `StudyDungeonPolicy` class with thresholds `{ weak: 60, dead: 10 }`
    - Implement `init(payload, now)`: returns `{ halfLifeDays: 2 }` for "new", `5` for "shaky", `10` for "solid"
    - Implement `healthAt(item, now)`: returns `item.health × 0.5^((now - item.lastEventAt) / (halfLifeDays × 86400000))`
    - Implement `applyEvent(item, event, now)`: correct → `{ health: 100, halfLifeDays: min(doubled, 180) }`, incorrect → `{ health: 45, halfLifeDays: max(halved, 1) }`
    - Implement `nextDueAt(item, now)`: dead → null, already weak → now, else → `lastEventAt + (halfLifeDays × 86400000 × log2(health / 60))`
    - Implement `resurrect(item, event, now)`: correct → `{ ok: true }` (policyData already holds the half-life at death, so it is left unchanged), incorrect → `{ ok: false, reason: "You got it wrong. The fact stays dead." }`
    - Export policy instance
    - _Requirements: 1, 2, 3, 4_
  
  - [x] 2.2 Write unit tests for policy
    - Create `src/policy.test.ts`
    - Test the policy passes `checkPolicy` (from `@decay-engine/engine`) with sample payloads for all three knowledge levels and both review events
    - Test `init` for each knowledge level ("new" → 2, "shaky" → 5, "solid" → 10)
    - Test `healthAt` exponential decay formula with specific time values
    - Test `applyEvent` correct: health → 100, half-life doubled (clamped at 180)
    - Test `applyEvent` incorrect: health → 45, half-life halved (clamped at 1)
    - Test `nextDueAt` for alive (returns future time), weak (returns now), dead (returns null)
    - Test `nextDueAt` calculation precision (within 1 minute of expected)
    - Test `resurrect` success with correct answer returns `{ ok: true }` and, through the engine, the item comes back with the half-life it had when it died
    - Test `resurrect` failure with incorrect answer returns error reason
    - _Requirements: 1, 2, 3, 4_
  
  - [x] 2.3 Write outcome scenario tests
    - Add outcome tests to `src/policy.test.ts`
    - Create test fact with half-life 10 days, importance 2, costMinutes 2
    - Add to engine with knowledge "solid" (half-life 10), verify alive on day 7 (health ≈ 61.6) using `view`
    - Verify weak on day 8 (health ≈ 57.4)
    - Verify still weak on day 33 (health ≈ 10.2)
    - Verify dead on day 34 (stored health 0)
    - Verify diedAt is within 1 minute after the crossing at 10 × log2(10) ≈ 33.219 days (check crossing ≤ diedAt ≤ crossing + 60 000 ms)
    - Test correct review doubles half-life, incorrect review halves it
    - Test resurrection with correct answer restores the half-life from death time
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [x] 3. Create theme and wording configuration
  - Create `src/theme.ts` with Study Dungeon color palette (bg, stone, bone, pumpkin, blood, etc.) and fonts (Pirata One, Spectral, IBM Plex Mono)
  - Create `src/wording.ts` with list names (Crypt, Dungeon, Graveyard), actions (Fight, Challenge), state names (sleeping, monster, dead)
  - Export theme and wording objects
  - _Requirements: 15_

- [x] 4. Initialize DecayEngine instance
  - Create `src/engine-instance.ts`
  - Import `DecayEngine`, `LocalStorageAdapter`, policy from packages and local files
  - Create `idGenerator` function returning random string IDs
  - Create `LocalStorageAdapter` with namespace "study-dungeon"
  - Create and export `engine` instance: `new DecayEngine(policy, adapter, idGenerator)` (use `crypto.randomUUID()` for IDs)
  - Call `engine.tick(Date.now())` on load and every minute while not previewing, so deaths and weak crossings are saved with their bisected times. Never tick while previewing
  - _Requirements: 14_

- [x] 5. Implement Add/Edit Fact dialog
  - [x] 5.1 Create AddEditFactDialog component
    - Create `src/components/AddEditFactDialog.tsx`
    - Implement form with fields: question (max 140 chars), answer (max 140 chars), why (max 80 chars, optional), knowledge level (new/shaky/solid radio), importance (1/2/3 select), review cost (1/2/3/5 select)
    - Add validation for max lengths and required fields
    - On submit (add): call `engine.addItem({ payload: { question, answer, why, knowledge }, importance, costMinutes }, Date.now())`
    - On submit (edit): call `engine.edit(id, { payload: { question, answer, why, knowledge }, importance, costMinutes }, Date.now())`. Hide the knowledge field when editing and pass the stored value through unchanged
    - Close dialog after successful save
    - Style with Study Dungeon theme (bone text on stone background, pumpkin accent)
    - _Requirements: 5_
  
  - [x] 5.2 Style the dialog
    - Apply theme colors and fonts from `src/theme.ts`
    - Use semantic HTML: `<dialog>`, `<form>`, `<input>`, `<select>`
    - Ensure keyboard navigation works (Tab, Enter, Escape)
    - Add ARIA labels for screen readers
    - _Requirements: 5, 15_

- [x] 6. Implement Three Lists (Crypt, Dungeon, Graveyard)
  - [x] 6.1 Create ThreeLists component
    - Create `src/components/ThreeLists.tsx`
    - Implement tabs for Crypt, Dungeon, Graveyard
    - Load items via `engine.view(now)` and filter by state
    - **Crypt (alive)**: show wake-up time (`policy.nextDueAt` formatted as date), sort by nextDueAt ascending
    - **Dungeon (weak)**: show current health, sort by health ascending (weakest first)
    - **Graveyard (dead)**: show epitaph (`payload.why`) if present, sort by diedAt descending (most recent first)
    - Show counter badge per list with total count
    - _Requirements: 7_
  
  - [x] 6.2 Create ItemCard component
    - Create `packages/shell/src/components/ItemCard.tsx` (shared, generic over Payload; the app passes a render function for the item's text)
    - Accept item, state, theme, wording and onAction callback
    - Render question (truncate if long), state-specific info (wake-up time / health / epitaph)
    - Show state icon + text (candle for alive, monster for weak, tombstone for dead)
    - Add action button: "Fight" for alive/weak, "Challenge" for dead
    - Style with theme (stone card background, bone text, pumpkin action button)
    - _Requirements: 7, 15_
  
  - [x] 6.3 Add remove fact with confirmation
    - Add "Remove" button to ItemCard
    - On click, show confirmation dialog: "Remove this fact? This cannot be undone."
    - On confirm, call `engine.remove(id)` (no time argument)
    - On cancel, dismiss dialog
    - _Requirements: 6_

- [x] 7. Implement Fight interaction
  - [x] 7.1 Create FightDialog component
    - Create `src/components/FightDialog.tsx`
    - Accept item (alive or weak) and onClose callback
    - **Step 1**: Show question with "Show answer" button and "Walk away" button
    - **Step 2**: After "Show answer" clicked, reveal answer and show "I knew it" / "I forgot" buttons
    - On "I knew it": call `engine.tend(id, { kind: "review", correct: true }, Date.now())`
    - On "I forgot": call `engine.tend(id, { kind: "review", correct: false }, Date.now())`
    - On "Walk away": close dialog without calling engine
    - Show result feedback: "Correct! Health → 100, half-life doubled" or "Incorrect. Health → 45, half-life halved"
    - Style as a dark dungeon encounter (blood accent for wrong, ecto accent for correct)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 7.2 Create ChallengeDialog component
    - Create `src/components/ChallengeDialog.tsx`
    - Accept dead item and onClose callback
    - Show question and answer (no hide) with "I knew it" / "I forgot" buttons
    - On "I knew it": call `engine.resurrect(id, { kind: "review", correct: true }, Date.now())`
    - On "I forgot": call `engine.resurrect(id, { kind: "review", correct: false }, Date.now())`
    - Show result: "Resurrected! New half-life: X days" on success, "You got it wrong. The fact stays dead." on failure
    - Style with graveyard theme (slate accent for resurrection)
    - _Requirements: 8.6, 8.7, 8.8, 8.9_

- [x] 8. Implement Time Machine
  - [x] 8.1 Add reactive now state
    - In `src/App.tsx`, keep `realNow` (refreshed every minute) and `previewOffsetMs` (0 = today); `now = realNow + previewOffsetMs`
    - Pass `now` to all engine read calls: `view(now)`, `due(now)`, `triage(budget, now)`, `autopsy(id, now)`
    - When `previewOffsetMs > 0`, disable all write actions (buttons grayed, forms hidden). Do not compare `now` with `Date.now()`: the clock moves every millisecond
    - Add "Back to today" button that sets `previewOffsetMs` to 0
    - _Requirements: 11.2, 11.4_
  
  - [x] 8.2 Create TimeMachine component
    - Create `packages/shell/src/components/TimeMachine.tsx` (shared)
    - Implement slider: today to +60 days (controlled by the offset prop)
    - Add quick-jump buttons: +7, +14, +30 days
    - Add Play button: animates from today to +60 days over 5 seconds
    - On slider change, call `onChange(newOffsetMs)`
    - Show current date as formatted text
    - Style with moon accent for future preview
    - _Requirements: 11.1, 11.2, 11.5_
  
  - [x] 8.3 Add future preview banner
    - When `previewOffsetMs > 0`, show banner: "Future preview · nothing is saved"
    - Position at top of screen, use pumpkin background
    - Include "Back to today" button in banner
    - _Requirements: 11.3, 11.4_

- [x] 9. Implement Triage Panel
  - [x] 9.1 Create TriagePanel component
    - Create `packages/shell/src/components/TriagePanel.tsx` (shared, generic; the app passes wording and a render function for each item)
    - Add budget input options: 5, 10, 20, or custom minutes
    - On "Triage" button click, call `engine.triage(budgetMinutes, now)`
    - Display picks: question, value per minute, cost, days until death
    - Display others: question, "dies in N days"
    - Add "Start the session" button that opens fight dialogs for all picks in order
    - Style with ecto accent for picks, dim text for others
    - _Requirements: 9_
  
  - [x] 9.2 Implement fight queue
    - In `src/App.tsx`, add state for fight queue (array of item IDs)
    - When "Start the session" clicked, set queue to all pick IDs
    - Show FightDialog for queue[0], on close pop from queue and show next
    - When queue empty, show completion message
    - _Requirements: 9.5_

- [ ] 10. Implement Autopsy Dialog (HAND-WRITTEN cause-of-death sentences)
  - [x] 10.1 Create autopsy-sentences module (WRITTEN BY THE DEVELOPER; originally planned as hand-written)
    - Create `src/autopsy-sentences.ts`
    - Implement `generateCauseSentences(report: AutopsyReport<ReviewEvent>, payload: FactPayload): string[]` function
    - Craft narrative sentences using autopsy facts:
      - If `wentWeakAt`: "Went weak on [formatted date]"
      - If `lastTend`: "Last reviewed on [formatted date]"
      - "You were silent for [N days]" using `silenceMs`
      - Count missed reviews: filter `tends` for `correct: false`, report count
      - Compute half-life history by replaying tend events from initial half-life
    - Return array of cause-of-death sentences
    - Export function
    - As built: an optional third argument `{ timeZone?, locale?, halfLifeAtDeath? }`. Tests pass `timeZone: "UTC"`. For a resurrected fact the report does not carry the half-life the current life started with, so the half-life history is only replayed for facts never resurrected; the app passes `halfLifeAtDeath` (the dead item's `policyData.halfLifeDays`) so the cause can still say how many half-lives of silence killed it. The first sentence is the cause; the rest are supporting facts
    - _Requirements: 10_
  
  - [x] 10.2 Write tests for autopsy-sentences
    - Create `src/autopsy-sentences.test.ts`
    - Test that generated sentences contain expected dates
    - Test that silence duration is computed correctly
    - Test that missed review count is accurate
    - Test that half-life history is reconstructed correctly
    - Test with various autopsy scenarios (quick death, long silence, many wrong answers)
    - Build reports through the real engine (`InMemoryAdapter`, fixed timestamps, `timeZone: "UTC"`), and cover a resurrected fact with and without `halfLifeAtDeath`. Do not edit `autopsy-sentences.ts`; if a test shows a bug, stop and report it
    - _Requirements: 10.5, 10.6_
  
  - [ ] 10.3 Create AutopsyDialog component
    - Create `packages/shell/src/components/AutopsyDialog.tsx` (shared layout: epitaph, chart, sentences). It receives the report, the epitaph, the chart points and the cause sentences as props; the app calls `engine.autopsy(id, now)` and `generateCauseSentences`
    - Accept the report props and onClose callback
    - Show epitaph (`payload.why`) if present at top
    - Render health-over-time chart from creation/last resurrection to death (simple line chart, CSS + SVG)
    - Call `generateCauseSentences(report, payload)` and display sentences as paragraphs
    - Style with graveyard theme (slate text, tombstone icon)
    - _Requirements: 10_

- [ ] 11. Implement First Run and Reset
  - [x] 11.1 Create sample data generator
    - Create `src/sample-data.ts`
    - Implement `loadSampleData(engine: DecayEngine)` function
    - Use the 12 sample facts from `reports/Study Dungeon Wireframe (3).html` (questions, answers, epitaphs, importance, cost and their dated event histories)
    - Replay their dated events through the engine: `addItem(input, pastTime)`, `tend(id, event, pastTime)` in time order
    - Call `engine.tick(Date.now())` to settle all items at current time
    - Ensure resulting distribution: ~4 alive, ~4 weak, ~4 dead
    - Export function
    - _Requirements: 13.2, 13.3_
  
  - [x] 11.2 Write tests for sample data
    - Create `src/sample-data.test.ts`
    - Test `loadSampleData` creates 12 facts
    - Test facts are distributed across alive, weak, dead states
    - Test no errors thrown during event replay
    - Test all sample facts have valid payloads (questions, answers)
    - _Requirements: 13.3_
  
  - [ ] 11.3 Create FirstRun component
    - Create `src/components/FirstRun.tsx`
    - Detect first run: the localStorage flag `study-dungeon:started` is missing (checking for zero items would show first run again forever after "Start empty"). Both buttons set the flag
    - Show "Load sample data" and "Start empty" buttons
    - On "Load sample data": call `loadSampleData(engine)`, then close
    - On "Start empty": just close, show main app with add-fact prompt
    - Style as a welcome screen (pumpkin accent, centered layout)
    - _Requirements: 13.1, 13.2, 13.4_
  
  - [ ] 11.4 Add data reset feature
    - Add "Reset all data" button in app settings/menu
    - On click, show confirmation: "Reset all data? This cannot be undone."
    - On confirm, clear this app's storage key and the `study-dungeon:started` flag, then reload to show first run
    - _Requirements: 13.6_

  - [ ] 11.5 Add the first-run tour
    - 3-4 short tooltips after first run: the Crypt, the Dungeon, Fight, the time machine
    - Skippable, keyboard accessible, shown once (flag in localStorage)
    - _Requirements: 13.5_

- [ ] 12. Implement Hero Section and Stats
  - [ ] 12.1 Create HeroSection component
    - Create `src/components/HeroSection.tsx`
    - Show eyebrow text: "Your memory today"
    - If weak facts exist: "N facts are weakening" + primary button "Fight the weakest" → opens FightDialog with weakest fact
    - If no weak but alive exist: encouraging message (e.g., "All quiet in the crypt")
    - Show three stat cards: alive count, weak count, dead count
    - Calculate souls banished: for each item, count `engine.history(id)` entries of type "tended" with `event.correct === true`
    - Calculate streak: find current run of consecutive days ending today or yesterday with at least one "tended" entry
    - Style with hero layout (centered, large text, Pirata One font for counts)
    - _Requirements: 12_
  
  - [ ] 12.2 Style stat cards
    - Each card shows icon + number + label
    - Alive: candle icon, ecto accent
    - Weak: monster icon, pumpkin accent
    - Dead: tombstone icon, slate accent
    - Use IBM Plex Mono for numbers
    - _Requirements: 12.6, 15_

- [x] 13. Implement Counters component (shared prep)
  - Create `packages/shell/src/components/Counters.tsx`
  - Accept alive, weak, dead counts as props
  - Render three badges with counts
  - Style with theme colors (alive: ecto, weak: pumpkin, dead: slate)
  - Lives in packages/shell now (Requirement 16.1). Requirement 16.3 limits what the shell does, not where it lives
  - _Requirements: 7.4, 16_

- [x] 14. Implement History Log Viewer (shared prep)
  - Create `packages/shell/src/components/HistoryLogViewer.tsx`
  - Accept history entries array as prop
  - Render chronological list of entries with formatted timestamps
  - Show entry type and details (e.g., "Tended (correct)" or "Died")
  - Style as a log (mono font for timestamps, bone text)
  - The app passes a function that turns an entry into words (for example "Fought: knew it")
  - _Requirements: 16_

- [x] 15. Apply global styles and CSS variables
  - Create `src/styles/global.css`
  - Set CSS custom properties from theme: `--color-bg`, `--color-stone`, `--font-display`, etc.
  - Apply base styles: `body { background: var(--color-bg); color: var(--color-bone); font-family: var(--font-body); }`
  - Import Google Fonts in `index.html`: Pirata One, Spectral, IBM Plex Mono
  - _Requirements: 15.1_

- [ ] 16. Implement accessibility features
  - [ ] 16.1 Add keyboard navigation
    - Ensure all interactive elements reachable via Tab
    - Ensure Enter/Space activates buttons
    - Ensure Escape dismisses dialogs
    - Test keyboard-only navigation through entire app
    - _Requirements: 15.4_
  
  - [ ] 16.2 Add prefers-reduced-motion support
    - Query `prefers-reduced-motion` media feature
    - Disable all animations (candle flicker, monster shake) when enabled
    - Use static icons instead of animated ones
    - _Requirements: 15.3_
  
  - [x] 16.3 Verify WCAG AA contrast
    - Check bone (#f0e6cc) on bg (#060509) contrast ratio (should be 14.6:1, well above 4.5:1 requirement)
    - Check pumpkin (#ff8a2b) on bg contrast (should pass)
    - Fix any failing combinations
    - _Requirements: 15.3_
  
  - [ ] 16.4 Add ARIA labels and semantic HTML
    - Use `<button>`, `<dialog>`, `<nav>`, `<main>` semantic elements
    - Add ARIA labels for icon-only buttons (e.g., `aria-label="Remove fact"`)
    - Add live region announcements for state changes (e.g., "Fact added to Crypt")
    - _Requirements: 15.4_

- [ ] 17. Add CSS-only visual elements
  - [ ] 17.1 Create candle flame animation
    - Create `src/styles/animations.css`
    - Define `@keyframes flicker` for candle flame
    - Apply to alive fact icon
    - Respect `prefers-reduced-motion` (static when enabled)
    - _Requirements: 15.5_
  
  - [ ] 17.2 Create monster shake effect
    - Add `@keyframes shake` for monster icon on hover
    - Apply to weak fact icon
    - Respect `prefers-reduced-motion`
    - _Requirements: 15.5_
  
  - [ ] 17.3 Create tombstone SVG
    - Design inline SVG for tombstone icon
    - Style via CSS (stone fill, bone outline)
    - Use in Graveyard list and dead item cards
    - _Requirements: 15.5_

- [ ] 18. Polish and responsive layout
  - [ ] 18.1 Make layout responsive
    - Add mobile breakpoints (< 640px)
    - Stack hero and lists vertically on mobile
    - Adjust dialog widths for mobile
    - Test on various screen sizes
    - _Requirements: 15_
  
  - [ ] 18.2 Add loading states
    - Show skeleton loaders while engine loads from storage
    - (No async operations: every engine call is synchronous)
    - Style with bone-dim color
    - _Requirements: general polish_
  
  - [ ] 18.3 Add error boundaries
    - Wrap app in React error boundary
    - Show friendly error message on crash
    - Log errors to console
    - _Requirements: general robustness_

- [ ] 19. Final checkpoint - Ensure all tests pass
  - Run `pnpm test` in apps/study-dungeon
  - Verify all policy tests pass
  - Verify sample data loads correctly
  - Verify autopsy sentences generate correctly
  - Run `pnpm dev` and manually test all features
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 20. Add sound effects (Could priority: last task, cut first if time is short)
  - [ ] 20.1 Create sound toggle
    - Add sound toggle in app settings, default to off
    - Store preference in localStorage
    - _Requirements: 18.1_
  
  - [ ] 20.2 Add sound effects
    - Find CC0-licensed audio: sword slash (correct), monster growl (wrong), resurrection chime
    - Play sounds on tend/resurrect actions when enabled
    - Preload audio files for instant playback
    - _Requirements: 18.2_
  
  - [ ] 20.3 Test sound implementation
    - Verify sounds play on correct events
    - Verify toggle works
    - Verify no errors when sound disabled
    - _Requirements: 18_

## Notes

- **Decay-rule and cause-of-death modules**: The policy implementation (`src/policy.ts`) and autopsy cause-of-death sentences (`src/autopsy-sentences.ts`) are not Kiro's: both were written by the developer (originally planned as hand-written). Kiro generates only the tests for these modules, plus all UI components and app glue code.
- **Engine dependency**: All tasks depend on `packages/engine` being completed first. The engine provides `DecayEngine`, `LocalStorageAdapter`, and all core types.
- **Vertical slice approach**: Build features end-to-end (policy → UI → interaction) before moving to the next feature, ensuring continuous integration.
- **Shared shell**: ItemCard, Counters, HistoryLogViewer, TriagePanel, AutopsyDialog and TimeMachine live in `packages/shell` from the start (Requirement 16.1), with theme, wording and render functions passed in. Requirement 16.3 means they only have the features Study Dungeon needs now. App-only parts (fight and challenge dialogs, add/edit form, hero, first run) stay in the app.
- **Time machine**: writes are blocked by `previewOffsetMs > 0`, never by comparing `now` with `Date.now()`.
- **Sound effects are optional**: Task 20 is marked "COULD priority" per Requirement 18.3 and should be cut first if time is short.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3", "4"] },
    { "id": 2, "tasks": ["2.2", "2.3", "5.1"] },
    { "id": 3, "tasks": ["5.2", "6.1", "6.2"] },
    { "id": 4, "tasks": ["6.3", "7.1", "7.2"] },
    { "id": 5, "tasks": ["8.1", "8.2", "13", "14", "15"] },
    { "id": 6, "tasks": ["8.3", "9.1", "10.1", "11.1", "12.1", "16.1", "16.2", "16.3", "16.4"] },
    { "id": 7, "tasks": ["9.2", "10.2", "11.2", "12.2", "17.1", "17.2", "17.3"] },
    { "id": 8, "tasks": ["10.3", "11.3", "18.1", "18.2", "18.3"] },
    { "id": 9, "tasks": ["11.4", "11.5"] },
    { "id": 10, "tasks": ["20.1", "20.2", "20.3"] }
  ]
}
```
