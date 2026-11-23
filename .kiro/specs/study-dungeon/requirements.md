# Requirements Document: Study Dungeon

## Introduction

Study Dungeon is a spaced-repetition study app built on the Decay Engine. Facts you are forgetting come back as monsters. The app implements an exponential-decay policy where health halves every half-life since the last review. Correct answers double the half-life and restore full health; wrong answers halve the half-life and drop health to 45. The app provides a dark dungeon-themed UI with three lists (Crypt, Dungeon, Graveyard), a fight interaction, triage, autopsy, and a time machine preview.

## Glossary

- **Fact**: An item with a question, answer, optional epitaph ("why it matters"), half-life (in days), importance (1-3), and review cost (1, 2, 3, or 5 minutes)
- **Half-life**: The time in days for a fact's health to decay from 100 to 50 without review
- **Review**: A tend event where the user answers the fact's question correctly or incorrectly
- **Challenge**: An attempt to resurrect a dead fact by answering it correctly
- **Monster**: Visual representation of a weak fact in the Dungeon
- **Tombstone**: Visual representation of a dead fact in the Graveyard
- **Candle**: Visual metaphor for health (bright when alive, dim when weak, extinguished when dead)
- **Crypt**: The alive list, showing facts sleeping until they need review
- **Dungeon**: The weak list, showing weak facts as monsters that need fighting
- **Graveyard**: The dead list, showing tombstones with epitaphs
- **Fight**: The UI interaction for reviewing a fact (alive or weak) or challenging a grave
- **Epitaph**: The optional "why it matters" text shown on a tombstone and in the autopsy
- **Soul**: A successfully reviewed fact (counter shows total souls banished)
- **Streak**: Days in a row with at least one review

## Type Contract

```typescript
// App-specific types for Study Dungeon

type FactPayload = {
  question: string              // max 140 chars, required
  answer: string                // max 140 chars, required
  why: string                   // max 80 chars, optional epitaph
  knowledge: "new" | "shaky" | "solid"  // initial knowledge level
}

type FactPolicyData = {
  halfLifeDays: number          // current half-life in days, min 1, max 180
}

type ReviewEvent = {
  kind: "review"
  correct: boolean
}

// The Study Dungeon policy implements DecayPolicy<FactPayload, FactPolicyData, ReviewEvent>
```

## Requirements

### Requirement 1: Exponential Decay Policy

**User Story:** As a learner, I want facts to decay exponentially based on their half-life, so that items I have not reviewed in a while become monsters.

#### Acceptance Criteria

1. WHERE a fact has health H at lastEventAt time T and a half-life of D days, WHEN computing health at time NOW, THE healthAt function SHALL return H × 0.5^((NOW - T) / (D × 86400000)).
2. WHERE payload.knowledge is "new", WHEN calling init, THE init function SHALL set halfLifeDays to 2.
3. WHERE payload.knowledge is "shaky", WHEN calling init, THE init function SHALL set halfLifeDays to 5.
4. WHERE payload.knowledge is "solid", WHEN calling init, THE init function SHALL set halfLifeDays to 10.
5. THE policy thresholds SHALL be { weak: 60, dead: 10 }.

### Requirement 2: Review Event Handling

**User Story:** As a learner, I want correct answers to strengthen the fact and wrong answers to weaken it, so that the system adapts to my actual knowledge.

#### Acceptance Criteria

1. WHERE a fact receives a review event with correct: true, WHEN calling applyEvent, THE function SHALL return health: 100 and policyData with halfLifeDays doubled.
2. WHERE a fact receives a review event with correct: false, WHEN calling applyEvent, THE function SHALL return health: 45 and policyData with halfLifeDays halved.
3. WHERE doubling the half-life would exceed 180 days, WHEN applying a correct review, THE applyEvent function SHALL clamp halfLifeDays to 180.
4. WHERE halving the half-life would fall below 1 day, WHEN applying an incorrect review, THE applyEvent function SHALL clamp halfLifeDays to 1.

### Requirement 3: Next Due Calculation

**User Story:** As a learner, I want to be notified when a fact is about to drop below 60 health, so that I can review it before it becomes weak.

#### Acceptance Criteria

1. WHERE a fact has health H at lastEventAt time T and a half-life of D days, WHEN calling nextDueAt with NOW, THE function SHALL return T + (D × 86400000 × log2(H / 60)) if H is at or above 60.
2. WHERE a fact's health at time NOW is already below 60, WHEN calling nextDueAt, THE function SHALL return NOW.
3. WHERE a fact is dead, WHEN calling nextDueAt, THE function SHALL return null.

### Requirement 4: Resurrection Logic

**User Story:** As a learner, I want to bring back dead facts by answering them correctly, so that I can recover forgotten knowledge.

#### Acceptance Criteria

1. WHERE a dead fact receives a resurrection attempt with a review event where correct is true, WHEN calling resurrect, THE function SHALL return { ok: true } with no policyData, so the engine keeps the half-life the fact had when it died.
2. WHERE a dead fact receives a resurrection attempt with a review event where correct is false, WHEN calling resurrect, THE function SHALL return { ok: false, reason: "You got it wrong. The fact stays dead." }.
3. WHERE a fact is successfully resurrected, WHEN the engine applies the result, THE item SHALL have health 100, state "alive", timesResurrected incremented, and diedAt cleared.

### Requirement 5: Add and Edit Facts

**User Story:** As a learner, I want to add new facts and edit existing ones, so that I can maintain my study collection.

#### Acceptance Criteria

1. WHEN adding a fact, THE app SHALL require a question (max 140 chars) and answer (max 140 chars).
2. WHERE the user provides "why it matters" text, WHEN adding or editing a fact, THE app SHALL store it in payload.why (max 80 chars).
3. WHERE the user selects "how well do you know it" (brand new / shaky / solid), WHEN adding a fact, THE app SHALL set payload.knowledge to "new" / "shaky" / "solid" and call engine.addItem with the payload.
4. WHEN adding a fact, THE app SHALL allow the user to set importance (1, 2, or 3) and review cost (1, 2, 3, or 5 minutes).
5. WHERE the user edits a fact's question, answer, or why, WHEN saving changes, THE app SHALL call engine.edit to update the payload, and WHERE the user edits importance or review cost, WHEN saving changes, THE app SHALL call engine.edit to update those fields.

### Requirement 6: Remove Facts with Confirmation

**User Story:** As a learner, I want to remove a fact with a confirmation step, so that I do not accidentally delete my work.

#### Acceptance Criteria

1. WHEN the user clicks "Remove" on a fact, THE app SHALL show a confirmation dialog asking "Remove this fact? This cannot be undone."
2. WHERE the user confirms removal, WHEN the confirmation is accepted, THE app SHALL call engine.remove with the fact's ID.
3. WHERE the user cancels removal, WHEN the cancellation is triggered, THE app SHALL dismiss the dialog and take no action.

### Requirement 7: The Three Lists

**User Story:** As a learner, I want to see my facts organized into Crypt (alive), Dungeon (weak), and Graveyard (dead), so that I know what needs attention.

#### Acceptance Criteria

1. WHERE a fact is alive, WHEN viewing the lists, THE app SHALL show the fact in the Crypt with its wake-up time (when health will drop below 60).
2. WHERE a fact is weak, WHEN viewing the lists, THE app SHALL show the fact in the Dungeon as a monster with its current health.
3. WHERE a fact is dead, WHEN viewing the lists, THE app SHALL show the fact in the Graveyard as a tombstone with its epitaph (payload.why) if provided.
4. WHEN displaying each list, THE app SHALL show a counter badge with the total count for that state.
5. WHERE the Dungeon has weak facts, WHEN sorting them, THE app SHALL show the weakest (lowest health) first.

### Requirement 8: Fight Interaction

**User Story:** As a learner, I want to fight monsters and challenge graves by answering questions, so that I can review or resurrect facts.

#### Acceptance Criteria

1. WHERE a fact is weak or alive, WHEN starting a fight, THE app SHALL display the question with a "Show answer" button, and "Walk away" SHALL be available before and after the answer is shown.
2. WHERE the user presses "Show answer", WHEN the button is pressed, THE app SHALL reveal the answer and present "I knew it" and "I forgot" buttons.
3. WHERE the user clicks "I knew it", WHEN the button is pressed, THE app SHALL call engine.tend with { kind: "review", correct: true }.
4. WHERE the user clicks "I forgot", WHEN the button is pressed, THE app SHALL call engine.tend with { kind: "review", correct: false }.
5. WHERE the user clicks "Walk away", WHEN the button is pressed, THE app SHALL dismiss the fight without calling tend.
6. WHERE a fact is dead, WHEN starting a Challenge, THE app SHALL show the question and answer, then present "I knew it" (resurrect) and "I forgot" (stays dead).
7. WHERE the user attempts to resurrect a dead fact, WHEN clicking "I knew it", THE app SHALL call engine.resurrect with { kind: "review", correct: true }.
8. WHERE the user clicks "I forgot" on a grave, WHEN the button is pressed, THE app SHALL call engine.resurrect with { kind: "review", correct: false } so the failure is recorded in history.
9. WHERE resurrection succeeds or fails, WHEN the result is returned, THE app SHALL show the outcome including the new half-life (on success) or the failure reason.

### Requirement 9: Triage Panel

**User Story:** As a learner, I want to select a time budget and see which weak facts are worth saving first, so that I can make the best use of my study time.

#### Acceptance Criteria

1. WHEN the Triage panel is shown, THE app SHALL display input options for 5, 10, 20, or custom minutes.
2. WHERE the user enters or selects a budget, WHEN clicking "Triage", THE app SHALL call engine.triage with the budget in minutes.
3. WHERE triage returns picks, WHEN displaying results, THE app SHALL show each pick with its question, value per minute, cost, and days until death.
4. WHERE triage returns others (weak facts not picked), WHEN displaying results, THE app SHALL show each with "dies in N days" text.
5. WHERE triage picks one or more facts, WHEN the user clicks "Start the session", THE app SHALL queue fights for all picks in order.

### Requirement 10: Autopsy for Dead Facts

**User Story:** As a learner, I want to see a detailed report of why a fact died, so that I understand what went wrong.

#### Acceptance Criteria

1. WHERE a fact is dead, WHEN viewing its autopsy, THE app SHALL call engine.autopsy and display the epitaph (payload.why) if present.
2. WHERE autopsy returns data, WHEN rendering the report, THE app SHALL show a health-over-time chart from creation or last resurrection to death.
3. WHERE autopsy returns wentWeakAt, WHEN rendering, THE app SHALL include text "Went weak on [date]" in the cause-of-death section.
4. WHERE autopsy returns lastTend, WHEN rendering, THE app SHALL include text "Last reviewed on [date]" in the report.
5. WHERE autopsy returns silenceMs, WHEN rendering, THE app SHALL include text "You were silent for [N days]", and WHERE autopsy returns tends, WHEN rendering, THE app SHALL include the number of missed reviews (tends with correct: false) and the half-life history worked out by replaying the tend events from the first half-life.
6. WHEN rendering the autopsy, THE app SHALL write cause-of-death sentences using the autopsy facts, not echo raw timestamps.

### Requirement 11: Time Machine Preview

**User Story:** As a learner, I want to preview future states up to 60 days ahead, so that I can see which facts will die if I take no action.

#### Acceptance Criteria

1. WHEN the time machine slider is shown, THE app SHALL allow selection from today to +60 days.
2. WHERE the slider is moved, WHEN a future date is selected, THE app SHALL call engine.view(futureNow) for all facts and update the lists.
3. WHERE the time machine is active, WHEN viewing the app, THE app SHALL display "Future preview · nothing is saved" and disable all write actions (add, edit, remove, tend, resurrect).
4. WHERE the user clicks "Back to today", WHEN the button is pressed, THE app SHALL reset the time machine to now and re-enable write actions.
5. WHEN the time machine UI is shown, THE app SHALL provide a Play button that animates from today to +60 days, and quick-jump buttons for +7, +14, and +30 days that are always available.

### Requirement 12: Hero Section and Stats

**User Story:** As a learner, I want to see motivational stats like souls banished and streak, so that I stay encouraged.

#### Acceptance Criteria

1. WHERE the app loads, WHEN displaying the hero section, THE app SHALL show "Your memory today" as the eyebrow text.
2. WHERE there are weak facts, WHEN rendering the hero, THE app SHALL show "N facts are weakening" and a primary action button to fight the weakest.
3. WHERE there are no weak facts but there are alive facts, WHEN rendering, THE hero SHALL show an encouraging message about the crypt.
4. WHEN calculating souls banished, THE app SHALL count all history entries of type "tended" where the event has correct: true.
5. WHEN calculating streak, THE app SHALL find the current run of consecutive days ending today or yesterday with at least one "tended" history entry.
6. WHEN displaying stats, THE app SHALL show alive, weak, and dead counts as three separate stat cards.

### Requirement 13: First Run and Data Reset

**User Story:** As a new user, I want to load sample data or start empty, so that I can try the app or start fresh.

#### Acceptance Criteria

1. WHERE the app detects no stored data, WHEN first run is triggered, THE app SHALL show "Load sample data" and "Start empty" buttons.
2. WHERE the user clicks "Load sample data", WHEN the button is pressed, THE app SHALL add 12 sample facts covering brand new, shaky, and solid knowledge levels.
3. WHERE sample data is loaded, WHEN viewing the lists, THE sample SHALL include facts in all three states (alive, weak, dead) by replaying dated events through the engine (addItem and tend at past times, then tick at now).
4. WHERE the user clicks "Start empty", WHEN the button is pressed, THE app SHALL initialize with an empty storage and show the add-fact prompt.
5. WHEN first run completes, THE app SHALL optionally show a short tour (3-4 tooltips) explaining Crypt, Dungeon, and Fight.
6. WHERE the user requests "Reset all data", WHEN the request is made, THE app SHALL show a confirmation dialog asking "Reset all data? This cannot be undone.", and WHERE the user confirms, WHEN confirmed, THE app SHALL clear all storage and restart the first-run flow.

### Requirement 14: Storage in Browser

**User Story:** As a learner, I want all my facts to stay in my browser, so that my data is private and requires no account.

#### Acceptance Criteria

1. WHEN creating the engine, THE app SHALL use LocalStorageAdapter with namespace "study-dungeon".
2. WHERE the user adds, edits, removes, or reviews facts, WHEN any write operation completes, THE engine SHALL persist the new state to localStorage.
3. WHERE the user returns to the app, WHEN the page loads, THE engine SHALL load the snapshot from localStorage and restore all facts and history.
4. WHEN storing data, THE adapter SHALL use the key "decay-engine:study-dungeon".

### Requirement 15: Visual Theme and Accessibility

**User Story:** As a learner, I want a dark, spooky, readable interface that works with keyboard and respects my motion preferences, so that the app is usable and comfortable.

#### Acceptance Criteria

1. WHEN rendering any UI, THE app SHALL use the Study Dungeon color palette (bg: #060509, pumpkin: #ff8a2b, bone: #f0e6cc, blood: #ff5f77, etc.) and Pirata One for headings, Spectral for body, IBM Plex Mono for numbers.
2. WHERE an item's state is shown, WHEN rendering, THE app SHALL use both an icon and text (never color alone).
3. WHEN the user has prefers-reduced-motion enabled, THE app SHALL disable all animations (candle flicker, monster shake, etc.).
4. WHERE any interactive element is shown, WHEN using keyboard navigation, THE element SHALL be reachable via Tab and activatable via Enter or Space.
5. WHEN rendering visual elements, THE app SHALL use only CSS and inline SVG, never external images or icon libraries.

### Requirement 16: Shared Shell Components

**User Story:** As a developer, I want to build reusable shell components that other apps can use, so that Ghosted and Expiry Reaper can share the same structure.

#### Acceptance Criteria

1. WHEN building the app, THE implementation SHALL place the counters (alive/weak/dead), item card, history log viewer, Triage panel, autopsy dialog, and time machine components in packages/shell.
2. WHERE a shell component is rendered, WHEN the app uses it, THE component SHALL accept the app's skin (colors, fonts, CSS variables) and wording (list names, button labels, state names) as props.
3. WHEN building shell components, THE implementation SHALL build only what Study Dungeon needs now, not what Ghosted or Expiry Reaper might need later.

### Requirement 17: Policy Tests

**User Story:** As a developer, I want comprehensive tests for the Study Dungeon policy, so that the decay rules are proven correct.

#### Acceptance Criteria

1. WHEN running tests, THE policy SHALL pass checkPolicy validation.
2. WHERE a fact has half-life 10 days and no review, WHEN testing outcome scenarios in apps/study-dungeon/src/policy.test.ts, THE tests SHALL verify the fact is alive on day 7, weak on day 8, still weak on day 33, and dead on day 34.
3. WHERE a fact has half-life 10 days and dies without review, WHEN testing death timing, THE test SHALL verify diedAt is within 1 minute after the crossing at 10 × log2(10) ≈ 33.219 days.
4. WHERE a fact receives a wrong answer, WHEN testing applyEvent, THE test SHALL verify health becomes 45 and the half-life halves, clamped to a minimum of 1 day.
5. WHERE a fact receives a correct answer, WHEN testing applyEvent, THE test SHALL verify health becomes 100 and the half-life doubles, clamped to a maximum of 180 days.

### Requirement 18: Sound Effects

**User Story:** As a learner, I want optional sound effects to make the experience more immersive, so that fighting monsters feels more engaging.

#### Acceptance Criteria

1. WHEN rendering the app, THE implementation SHALL provide an optional sound toggle that is off by default.
2. WHERE sound is enabled, WHEN playing sound effects, THE app SHALL use only original or CC0-licensed audio files.
3. WHEN prioritizing features, THE implementation SHALL mark sound effects as "Could" priority (cut first if time is short).

### Requirement 19: A Compact Time Dock (task L2)

**User Story:** As a learner, I want the time dock to stay small until I need it, so that it does not cover the monsters and lists under it.

#### Acceptance Criteria

1. WHEN the page loads with no remembered choice, THE time dock SHALL be collapsed at every width: one slim bar with the candle at its small size, the time machine title, the shown date line (today's date, or the previewed date) and the slider.
2. WHILE the dock is collapsed, THE quick jumps, Play, the marker track, its tick labels and the "Next: …" line SHALL not be shown and SHALL not be reachable with Tab.
3. WHEN the user activates the toggle, THE dock SHALL expand and show everything in 19.2; activating it again SHALL collapse it. The toggle SHALL be a native `<button>`, shown at every width (today it shows only below 520 px), with `aria-expanded`, the visible name "Coming up" from `wording.ts` (the same in both states and in both apps), and a target of at least 44×44 px.
4. WHEN the dock collapses or expands, THE preview offset SHALL stay the same. THE preview banner (rendered by the App, outside the dock) SHALL keep showing while previewing, and every write SHALL stay blocked. Moving the slider while collapsed SHALL change the preview as it does when expanded.
5. WHEN the user expands or collapses the dock, THE choice SHALL be kept in `sessionStorage` and restored on a reload in the same tab. WHERE `sessionStorage` cannot be used, THE choice SHALL last until the page is closed. No `localStorage` key SHALL be added.
6. THE markers SHALL keep their current labels ("Day 12: Ana dies", as accessible name and title). No marker is missing a label, so nothing about the markers changes.
7. AT 320, 390 and 1280 px wide, THE collapsed bar SHALL not cover page content: the page's bottom padding and scroll padding SHALL be at least the dock's measured height, and SHALL follow it when the dock expands or collapses.
8. THE toggle and any change of size SHALL respect reduced motion: any transition sits inside `@media (prefers-reduced-motion: no-preference)`.
9. Tab order SHALL follow the DOM. The dock stays last on the page. Inside it come the slider, then the toggle, then (when expanded) the markers, the jumps and Play.
10. ALL new text SHALL come from `wording.ts`. No colour outside the Study Dungeon tokens. No change to `packages/engine/` or `packages/shell/`.
11. THE first-run tour step that points at the time machine (`.shell-time-machine`) SHALL still find it, collapsed or expanded.
12. WHILE the dock is collapsed, THE bar SHALL show a short hint from `wording.ts`, "Drag to look ahead". WHEN the dock is expanded, THE hint SHALL not be shown. A wording test SHALL cover the hint's words.
13. WHERE `ResizeObserver` is not available, THE dock SHALL set no measured height, and the page SHALL keep the CSS fallback room (today's values).
14. THIS requirement SHALL be built only after Ghosted Requirement 34 is built and checked. If it is not done in time, Ghosted ships without it.

### Requirement 20: The Loss Forecast Line (task P4)

**User Story:** As a learner, I want the hero to tell me how many facts weaken and die in the next 7 days if I do nothing, so that I see what I am about to lose on the first screen.

Terms: `realNow` is the App's real time (the last settle tick), never the previewed time. **The next 7 days** is the rolling window `(realNow, realNow + 7 × DAY_MS]`: it starts just after `realNow` and includes the moment exactly 7 days later. It is not a calendar week.

#### Acceptance Criteria

1. WHILE not previewing and at least one fact is alive or weak at `realNow`, THE hero SHALL show one line of plain text directly under its heading (the `h2` with the hero message), before the "Start with …" line and the "Fight the weakest" button, giving the number of facts that will weaken and the number that will die in the next 7 days.
2. A fact SHALL be counted as **will die** WHEN `engine.forecast(realNow, 7 × DAY_MS)` lists it: it is not dead at `realNow` and the engine shows it dead at `realNow + 7 × DAY_MS`.
3. A fact SHALL be counted as **will weaken** WHEN it is alive at `realNow` (engine state `alive`), `studyDungeonPolicy.nextDueAt(fact, realNow)` falls in the next 7 days, and it is not counted as will die. A `nextDueAt` exactly at `realNow + 7 × DAY_MS` SHALL be counted, as the dock marks it on day 7.
4. EACH fact SHALL be counted at most once. A fact that weakens and dies within the same 7 days SHALL be counted only as will die. A fact already weak or dead at `realNow` SHALL never be counted as will weaken.
5. THE counts SHALL come from the existing `timelineEvents` (`timeline.ts`) applied to `engine.view(realNow)` and `engine.forecast(realNow, 7 × DAY_MS)` with `maxDays` 7, so the line agrees with the time dock's markers for days 1 to 7. No policy formula SHALL be repeated in the new code.
6. WHEN both counts are 0, THE line SHALL read "Nothing will weaken or die in the next 7 days." Otherwise it SHALL use the sentences in design "Loss Forecast Line", Wording, with the words weaken, die and facts.
7. WHILE previewing, THE line SHALL not be shown. THE existing preview forecast ("Compared with today, … This is a preview, nothing is saved.", `heroExtraText.forecast`) SHALL stay exactly as it is, so the two never show together. WHEN the user goes back to today, THE line SHALL show again.
8. WHEN there are no facts, or every fact is dead at `realNow`, THE line SHALL not be shown. (On the first run the hero is not shown at all.)
9. THE line SHALL be worked out again after every write (`version`) and on every settle tick (`realNow`). It SHALL store nothing (no new storage key) and SHALL make no network request.
10. THE line SHALL be a plain `<p>` in the hero, with no `aria-live`, no `role="status"` or `role="alert"`, and not inside a live region, so a screen reader is not told about it on every tick. It SHALL not be focusable. It SHALL use the colour and background of the existing `.sd-hero-sub` line (`--color-bone-dim` on the hero), with no new colour and no animation.
11. ALL its words SHALL come from `wording.ts` (`heroText.lossForecast`), and a test SHALL check them exactly.
12. THE change SHALL not touch `packages/engine/` or `packages/shell/`, and SHALL not edit any file that `authorship.md` lists as written by Claude Code (`timeline.ts`, `policy.ts` and `sample-data.ts` are imported unchanged).

### Requirement 21: What This Session Saves (task P5)

**User Story:** As a learner, I want Triage to tell me how many of the facts it picked would die in the next 7 days and survive them if I answer right, so that I see what my minutes save.

Terms: `now` is the time the Triage panel runs at (the App's `now`, the one `runTriage` already uses). **The next 7 days** is the window `(now, now + LOSS_FORECAST_DAYS × DAY_MS]`, with `LOSS_FORECAST_DAYS` (7) imported from `loss-forecast.ts` (Requirement 20), not a new number. The **picks** are `engine.triage(budget, now).picks` for the budget the panel shows. A pick is **at risk** WHEN its `diesAt` is not `null` and is at or before `now + 7 days`. An at-risk pick is **saved** WHEN a right answer at `now` leaves its health at `now + 7 days` at or above the dead threshold (10), worked out with `studyDungeonPolicy.applyEvent` and `studyDungeonPolicy.healthAt` on a copy of the pick (design "What This Session Saves").

#### Acceptance Criteria

1. WHEN Triage has run and shows at least one pick, and at least one pick is saved, THE panel SHALL show one line of plain text under the "Fight these first" list and before the "Start the session" button, giving the number of saved picks.
2. THE number SHALL be the count of distinct pick ids that are saved. It SHALL be read from the picks of the triage result the panel shows, never from a second list or a second formula. A pick whose `diesAt` is `null`, or later than `now + 7 days`, SHALL not be counted. A pick whose `diesAt` is exactly `now + 7 days` SHALL be counted when it is saved.
3. Triage candidates are weak facts only (engine Requirement 17b). So a fact in the Crypt or the Graveyard is never counted, and nor is a weak fact that is not a pick (the "Still lurking" list).
4. AN at-risk pick that a right answer cannot keep alive for the next 7 days SHALL not be counted. (A right answer gives health 100 and doubles the half-life, and a fact at 100 dies after 3.32 half-lives. So a pick whose half-life is 1 day, 2 days after the answer, dies 6.64 days later, inside the window.) The line SHALL therefore never claim more than a right answer gives.
5. THE line SHALL say it assumes right answers ("Answering these right saves …"), because a wrong answer sets health to 45 and halves the half-life. Its words SHALL come from `wording.ts` (`triageNoteText.saves`), with a singular and a plural form, saying facts "die" "in the next 7 days", never "this week". `theme.test.ts` (the app's wording test) SHALL check the exact words.
6. THE line SHALL not be shown before Triage has run, WHEN there are no picks (no weak facts, or none fits the budget), or WHEN no pick is saved. It SHALL never say "0".
7. THE line SHALL follow the panel: it SHALL be worked out again whenever the panel works out its picks again (a new budget is run, `now` changes, or a write bumps `version`), and SHALL always describe the picks shown at that moment.
8. WHILE previewing, THE line SHALL follow the same rule at the previewed `now`, as the picks do. "Start the session" stays disabled with its reason, as today.
9. THE line SHALL be a plain `<p>`, with no `aria-live`, no `role="status"` or `role="alert"`, not inside a live region and not focusable. It SHALL use `--color-bone-dim` on the Triage panel, the colour the panel's numbers already use, with no new colour and no animation.
10. THERE SHALL be a gap of at least 8 px between the line and the last pick above it, and between the line and the "Start the session" button below it, at every width. No CSS rule SHALL hide the line at any width.
11. THE line SHALL use the shell `TriagePanel`'s optional `picksNote` prop, added once in Ghosted task 10.1 (Ghosted Requirement 36.11). Study Dungeon SHALL make no other shell change, and its existing tests of the panel SHALL pass unchanged.
12. THE change SHALL not touch `packages/engine/`, SHALL store nothing and SHALL make no network request. It SHALL not edit any file that `authorship.md` lists as written by Claude Code (`policy.ts`, `timeline.ts`, `sample-data.ts` and `contrast.test.ts` are used unchanged).
13. A property test SHALL prove that every counted pick, after a right answer at `now` through the real engine, is not dead at any time in the next 7 days, and that every at-risk pick not counted is dead at `now + 7 days` even after a right answer.

### Requirement 22: Rescue Point (task R1)

**User Story:** As a learner looking at a grave, I want one line in the autopsy that says how much longer the fact would have lived if I had reviewed it right when it first went weak, so that I see what one review at the right moment was worth.

R1 depends on `@decay-engine/insight` (task E1, `.kiro/specs/insight/`). It uses only Insight's public API: `whatIf(policy, item, history, { at, event }, options?)` and `DEATH_TIME_PRECISION_MS`.

Terms:

- The **report** is `engine.autopsy(id, now)` for the dead fact, at the dialog's `now` (the App's `now`, the previewed time while previewing).
- **The good event** is `RESCUE_EVENT = { kind: "review", correct: true }`, a right review.
- **The what-if** is `whatIf(studyDungeonPolicy, fact, engine.history(id), { at: report.wentWeakAt, event: RESCUE_EVENT })`, where `fact` is the dead fact from `engine.view(now)`.
- **P** is `DEATH_TIME_PRECISION_MS` (60,000 ms), imported from Insight.
- **The extra days** are `N = floor((diesAt − baselineDiesAt + P) / DAY_MS)`, from the what-if result (amended by the developer's decision, Session 67: P is added, not taken off).
- **The end date** is the calendar date of `diesAt` itself in the viewer's time zone (amended, Session 67).

#### Acceptance Criteria

1. WHEN the autopsy dialog of a dead fact opens and the rescue point exists (22.3), THE dialog SHALL show one sentence: "A review on <date of at>, when it went weak, would have kept it alive until <end date>, <N> days longer." For N = 1 it SHALL say "1 day longer". (Amended, Session 67: no "first".) The template SHALL live in `wording.ts` (`rescueText.sentence`), and `theme.test.ts` SHALL check its exact words.
2. THE good event SHALL be a right review. A right review is the only event that restores health (100) and doubles the half-life; a wrong review sets health to 45 and halves it, so it can never be a rescue.
3. THE sentence SHALL not be shown, and nothing SHALL take its place, WHEN any of these holds: `report.wentWeakAt` is `null`; the what-if returns `ok: false`; its `stoppedAt` is not `null`; its `diesAt` or `baselineDiesAt` is `null`; `baselineDiesAt` differs from `report.diedAt` by more than P (the replay does not reproduce the real death); or N is less than 1 (the what-if death is not at least one whole day later after the precision is taken off).
4. THE date of `at`, the end date and N SHALL come only from the what-if result (`at`, `diesAt`, `baselineDiesAt`) and P. No policy formula SHALL be written in the new code, and no second death time SHALL be worked out.
5. THE precision rule (amended, Session 67): N adds P to the difference, and the end date is the date of `diesAt`. Both come only from the what-if result.
6. DATES SHALL be formatted as the cause sentences of `autopsy-sentences.ts` format them: day, short month and year ("14 Nov 2026", locale `en-GB` by default), in the given time zone, the viewer's own when none is given (amended, Session 67). The options are copied into `rescue-sentence.ts`, because that file's formatter is not exported, and a test SHALL check that both give the same text for the same time.
7. THE sentence SHALL be the second entry of the dialog's cause sentences, straight after the cause sentence from `autopsy-sentences.ts`, so the shell renders it as a plain `<p class="shell-autopsy-sentence">` in the cause section. It SHALL not be in a live region, SHALL not be focusable and SHALL add no colour or animation.
8. FOR a resurrected fact, THE sentence SHALL describe the current life only (the life in the report). A dead fact has no later resurrection, so the what-if's life cut never applies to it; WHEN `stoppedAt` is not `null` anyway, 22.3 applies.
9. WHILE previewing, THE sentence SHALL follow the same rules at the previewed `now`. It is read-only: it stores nothing, and "Challenge" stays disabled with its reason, as today.
10. THE new code SHALL never read the clock. Time reaches it only through the report (`wentWeakAt`, `diedAt`) and the what-if result.
11. THE sentence SHALL be built in a new file `apps/study-dungeon/src/rescue-sentence.ts`, written by Kiro. `autopsy-sentences.ts` and `policy.ts` (Claude Code's files, `authorship.md`) SHALL not be edited. `packages/engine/`, `packages/shell/` and `packages/insight/` SHALL not change.
12. `apps/study-dungeon/package.json` SHALL list `"@decay-engine/insight": "workspace:*"` in `dependencies`. `netlify.toml` SHALL not change: Netlify's base is the app folder and pnpm installs the whole workspace, so Insight is built from source with the app, as the shell is. The `pnpm-lock.yaml` written by `pnpm install` SHALL be committed with it.
13. Property tests SHALL prove, through the real engine and the real policy: the what-if death is never earlier than the real death by more than P; it is more than one day later WHEN no recorded tend follows `wentWeakAt` in the fact's life; the sentence's N equals `floor((diesAt − baselineDiesAt + P) / DAY_MS)` of the same what-if (amended, Session 67); and no sentence is shown WHEN `wentWeakAt` is `null`.

### Requirement 23: Live State Changes (task L3)

**User Story:** As a learner with the tab open, I want to see when a fact weakens or dies on its own, so that I notice the moment a creature wakes in the Dungeon or a grave appears in the Graveyard.

Terms: a **tick** is one settle tick of `useSettleTicks` (on load, then every minute while not previewing). A **reported change** is a fact whose state went `alive → weak`, `weak → dead` or `alive → dead` between two ticks. A fact's **name** in the message is its creature's name (`creatureOf(id).name`, for example "Gaze"), the name its card shows. Ghosted has the same feature in its own words (Ghosted Requirement 38).

#### Acceptance Criteria

1. A NEW pure function `diffStates(before, after)` in a new file `src/state-changes.ts` SHALL return one `{ id, from, to }` for each item present in both lists whose state differs, in the order of `after`. It SHALL read only ids and states, read no clock, call no engine and repeat no policy formula. Items present in only one list SHALL not be changes. It SHALL change neither input. Its logic SHALL be the same as Ghosted's `state-changes.ts`, with no import between the apps.
2. WHEN a tick finds reported changes, THE card of each changed fact SHALL react once: the creature wakes on a Dungeon card (alive → weak), and the tombstone drops into place on a Graveyard card (→ dead), by a CSS animation inside `@media (prefers-reduced-motion: no-preference)` only. The card SHALL carry the marker class `sd-just-changed` only until that animation ends, and the class SHALL then be removed. WHILE the user prefers reduced motion, THE class SHALL not be added.
3. WHEN a tick finds reported changes, THE App SHALL show ONE message (a toast) for the whole tick, with the sentences in design "Live State Changes", Wording: one fact, two facts (the more important first), and three or more (counted, naming the most important one). Its words SHALL come from `wording.ts` (`liveText`), SHALL use the app's own words ("just weakened" when a creature wakes, "went to the Graveyard" for a death, "facts" when counted, as in "Gaze just weakened." and "3 facts weakened, Gaze's among them."; amended by the developer, Session 69) and SHALL be checked exactly by `theme.test.ts`.
4. THE toast SHALL never cover the time dock (`--dock-h`), the Triage panel or other content; SHALL stay a few seconds (about 6) with motion, and until Dismiss or the next tick without motion; SHALL have one quiet Dismiss button; and SHALL never take focus.
5. THE toast's words SHALL be said once through the App's existing polite live region (`#sd-announcer`, `announce`). No second live region SHALL be added: the toast has no `aria-live` and no `role`. Its only element in the Tab order SHALL be Dismiss. WHEN a tick's storage problem or the clock notice was said in the same tick, THE live region SHALL keep that message, and the toast SHALL be shown without being said. WHEN focus is inside the toast as it goes, focus SHALL move to `<main>` (the App's existing focus target after the tour).
6. WHILE the tab is hidden (`document.visibilityState` is `"hidden"`), each reported change SHALL add one to a count, and THE tab title SHALL be `(<n>) Study Dungeon`, with `(9+)` above 9. WHEN `visibilitychange` makes the tab visible, THE count SHALL be 0 and THE original title SHALL be restored exactly. WHILE the tab is visible nothing SHALL be counted.
7. WHILE the count is above 0, THE favicon SHALL carry a badge from an SVG data URL (no network request), with a shape as well as a colour (`design-tokens.md`): a `--pumpkin` triangle when facts only weakened, a `--blood` cross when any died. The tab title SHALL be its text alternative, and the link's `title` SHALL hold the same words. At 0 the page's favicon SHALL be restored exactly (Study Dungeon's `index.html` has no favicon link, so the added link is removed).
8. AT 320 px and 390 px the toast SHALL fit, cause no horizontal scroll, keep at least 8 px from everything around it, and SHALL never be hidden at any width.
9. THE change detection SHALL run only on a tick and only when not previewing. It SHALL never report on the first tick at mount, on the first tick after "Back to today", or for a change caused by the user's own write (add, edit, fight, challenge, remove, import, sample load: the baseline is read again after every write).
10. THE App SHALL rely on `clock-guard.ts` (`heldClock`) for the tick time: it never runs behind the newest saved event, so `engine.tick` never throws `TIME_WENT_BACKWARD`, every tick reaches the handler and the before and after views are never out of order with the saved history. `clock-guard.ts` (Claude Code's) SHALL not be edited.
11. THE change SHALL not touch `packages/` (engine, shell, insight), `policy.ts`, `autopsy-sentences.ts`, `clock-guard.ts`, `creatures.ts` or `animations.css`, SHALL store nothing and SHALL make no network request.
12. A property test SHALL prove that, for any two lists of ids and states, `diffStates` returns exactly the items present in both whose state differs, once each, in the order of the second list, and that a list compared with itself gives no change. Its generator SHALL reach all three states and all six transitions (fixed-seed coverage check).

### Requirement 24: Notifications While the Tab Is Open (task L5)

**User Story:** As a learner with the dungeon open in a background tab, I want an opt-in browser notification when a fact weakens or dies, so that I notice it without watching the tab, and I want the app to tell me plainly that it cannot reach me when the tab is closed.

L5 starts after the L3 build is checked. It is one more consumer of L3's tick result (Requirement 23): the same `diffStates` and `liveNotice`, so a change that is notified is the same change that is toasted, in the same words. Ghosted has the same feature in its own words (Ghosted Requirement 39).

Terms: **the setting** is stored under `study-dungeon:notify` (`"on"` or `"off"`) in the App's `storage`, like the sound setting (`study-dungeon:sound`); missing, unreadable or any other value means off. **The permission** is `Notification.permission`. **Supported** means the browser has a `Notification` API.

#### Acceptance Criteria

1. THE setting SHALL be off by default. It SHALL sit in the settings row with "Answer by" and the sound switch (inside `ResetData`, after the sound switch), labelled "Notify me about changes while this tab is open", as a native checkbox with `role="switch"` and a `<label>`, as the sound switch is. It SHALL be in the Tab order and never disabled.
2. THE permission request SHALL happen only inside the change that turns the setting on, and only WHEN the permission is `"default"`. It SHALL never happen at load, on a tick, when turning the setting off, or WHEN the permission is already `"granted"` or `"denied"`. A second change while a request is pending SHALL not start a second request.
3. THE setting SHALL show exactly these states and sentences (design "Notifications While the Tab Is Open", Wording): **unsupported** (no switch; one sentence); **off**; **on** (one sentence on what happens); **denied** (off, permission `"denied"`: one sentence on how to allow it in the browser; the switch never asks again and the change only says that sentence once more through the live region); **blocked** (on, permission not `"granted"`: one sentence, and the switch turns it off). WHEN supported, THE setting SHALL always show the honest limit, "There is no server, so nothing can notify you when this tab is closed or the computer is asleep.", and the privacy sentence, "A notification shows only what is already on this page, and nothing is sent anywhere."
4. THE setting SHALL survive a reload. WHEN reading it throws, it SHALL be off. WHEN saving it throws, THE switch SHALL still work until the page is closed, and one sentence SHALL say the choice cannot be saved.
5. A notification SHALL be shown only WHEN all of these hold, decided by one pure function `shouldNotify` (`src/notify.ts`): the setting is on; the permission is `"granted"`; `document.visibilityState` is `"hidden"`; the tick is not in a preview; it is not the first tick at mount (nor the first after "Back to today"); and the tick has a notice. WHEN the tab is visible, only the toast SHALL show.
6. EACH tick SHALL show at most one notification: title "Study Dungeon" (`headerText.title`), body the notice's `text` (the toast's words), tag `study-dungeon-live`, `silent: true`, no `vibrate`, and the tab signal's data-URL icon (`badgeIcon(notice.worst)`).
7. WHEN the user clicks a notification, THE app SHALL call `window.focus()` and close it, and SHALL change no data.
8. THE words SHALL come from `wording.ts` (`notifyText`), SHALL contain no guilt words ("you forgot", "overdue", "late"), and SHALL be checked exactly by `theme.test.ts`.
9. THE feature SHALL make no network request and SHALL add no live region (the denied sentence after a change goes through `#sd-announcer`). Nothing SHALL take focus.
10. WHERE the `Notification` constructor throws, THE tick SHALL carry on; the toast and the tab signal are unaffected.
11. AT 320 px and 390 px the setting SHALL fit with no horizontal scroll and at least 8 px from its neighbours; no rule SHALL hide it at any width.
12. THE setting is a preference: it SHALL work while previewing, as the sound switch does, and "Reset all data" SHALL treat it as it treats the sound setting.
13. THE change SHALL not touch `packages/`, `policy.ts`, `autopsy-sentences.ts`, `clock-guard.ts`, `sound.ts` or the other files `authorship.md` lists as Claude Code's.

### Requirement 25: The First Ten Seconds (task L6)

**User Story:** As a first-time visitor, I want to watch the dungeon age by itself right after I load the sample facts, so that I understand what Study Dungeon does within ten seconds, without reading anything.

L6 starts after the L5 build is checked. Ghosted has the same feature in its own words (Ghosted Requirement 40).

Terms: **the first look** is one run of the existing preview, from today to +30 days and back, driven by the App, with nothing saved. **The flag** is `study-dungeon:first-look` (`"1"`) in the App's `storage`, beside the first-run and tour flags; it is not in `RESET_KEYS`. **The plan** is the pure function that gives the offset for each moment (design "The First Ten Seconds").

#### Acceptance Criteria

1. WHEN "Load sample data" saves the 12 sample facts AND the flag is not set, THE first look SHALL be due. It SHALL not be due on a page load with facts, after "Back to today", after "Start empty", an add, an import or a restore, or WHEN the flag is set.
2. A due first look SHALL start only WHEN the tour is finished or skipped (or not shown), no dialog is open and the App is not previewing. WHEN it starts, THE flag SHALL be set first, so a reload never plays it again. WHEN the flag cannot be read, THE first look SHALL be treated as seen; WHEN it cannot be saved, THE first look SHALL not play. Either way the app SHALL keep working.
3. WHILE the user prefers reduced motion, THE first look SHALL not play at all, and the flag SHALL still be set at the moment it would have started.
4. THE plan SHALL move the offset from 0 to exactly +30 days in the first 4 000 ms with an ease-in-out (cubic) curve, rounded to whole hours, hold at +30 days until 5 000 ms, and then return to 0 at once. The whole first look SHALL last 5 000 ms (`TIME_MACHINE_PLAY_MS`).
5. THE first look SHALL move the offset step by step on the dock's own Play (the shell `TimeMachine`'s frames, `frameScheduler` and `frameClock` in tests), with no new timer or `requestAnimationFrame` in `src/`. Every write SHALL stay blocked while it plays, so it saves nothing; the engine's save count SHALL not change.
6. WHILE it plays, THE existing preview banner ("Preview, nothing is saved", with "Back to today") SHALL show at the top of the page, and the room SHALL age as it does for the slider.
7. WHILE it plays, THE dock SHALL show one quiet button, "Skip the preview": a native `<button>` in the Tab order, named by its text, at least 44 × 44 px, with a visible focus outline. It SHALL sit at the top of the dock's own box (where the live-change toast sits), so it covers neither the dock's controls nor the hero, and it SHALL fit at 320 and 390 px wide with at least 8 px from its neighbours and no horizontal scroll. It SHALL disappear WHEN the first look ends.
8. Skip, Escape, "Back to today", any user change of the slider, a jump, a marker, Play, or a dialog opening SHALL stop the first look at once and return the offset to 0. The touch that stops it SHALL not move the offset itself. WHEN focus was on Skip, it SHALL go to `<main>` (the focus target after the tour).
9. WHEN it starts, THE App SHALL say once, through the existing polite live region (`#sd-announcer`), "Showing the next 30 days. Nothing is saved." It SHALL say nothing else while it plays, add no live region, and move no focus.
10. THE words SHALL come from `wording.ts` (`firstLookText`).
11. THE first look SHALL be off unless the App is given `firstLook` (main.tsx gives it), so existing tests that load the sample see no change.
12. THE change SHALL not touch `packages/`, `policy.ts`, `autopsy-sentences.ts`, `clock-guard.ts`, `sample-data.ts` or the other files `authorship.md` lists as Claude Code's, except the optional `firstLook` prop of `TimeDock.tsx`; it SHALL make no network request and leave every existing test unchanged.

