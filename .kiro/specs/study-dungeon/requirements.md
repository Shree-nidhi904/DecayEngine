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

