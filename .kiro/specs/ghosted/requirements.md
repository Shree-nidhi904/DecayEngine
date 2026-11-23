# Requirements Document: Ghosted

## Introduction

Ghosted is a keep-in-touch app built on the Decay Engine. It shows a quiet street at night where each person is a window. The light shows **connection freshness**: how recently the user was in touch. It never measures how much anyone cares or matters.

Freshness falls in a straight line from the last contact and reaches 0 at three times the person's usual rhythm. A quick text brightens the window by 40; a call or a meet-up lights it fully. A window that goes dark comes back fully lit when the user logs a contact (they replied).

The app reuses the engine unchanged, and the shared shell with three small, optional additions (Requirements 26 to 28). Each addition keeps the shell's current behaviour as the default. Inputs: `docs/design/ghosted-visual-brief.md` (the brief) and `docs/design/ghosted-wireframe.html` (the approved look).

## Glossary

- **Person**: An item. Its payload holds a name, a relationship tag, a usual rhythm in days and the last contact date given when the person was added.
- **Rhythm**: `payload.rhythmDays`, the usual number of days between contacts. An integer from 1 to 365.
- **T**: The span over which freshness falls from 100 to 0: `3 × rhythmDays × 86 400 000` ms.
- **Last contact**: `policyData.lastContactAt`, the timestamp that freshness decays from. The policy moves it on every contact.
- **Freshness**: The item's health (0 to 100) as shown to the user.
- **Contact**: A tend event of kind `"text"` (quick text or message), `"call"` or `"meetup"`.
- **Reach out**: The primary action on a lit or flickering window: log a contact.
- **Reconnect**: Resurrecting a dark window by logging a contact after they replied.
- **Window**: The art for one person. Its light amount is `--lit = health / 100`.
- **Lit / flickering / boarded up**: The window states for alive, weak and dead.
- **Still lit / Fading / Empty windows**: The alive, weak and dead lists (`theme-and-wording.md`).
- **The Street**: An overview of houses, each person a window on a house.
- **Moon-clock dock**: The fixed time machine at the bottom of the page, with a moon that crosses the sky as the user drags ahead.
- **Preview**: Any time the time machine is set later than today. Nothing is saved during a preview.
- **Forecast control**: A control that lists who goes dark within 7, 30 or 90 days, from `engine.forecast`.
- **DAY_MS**: 86 400 000.

## Type Contract

Proposed app types. `apps/ghosted/src/policy.ts` is written by Kiro from this spec (the developer's documented exception in `authorship.md`), so Kiro applies these types there. Compared with the current scaffold, `relationship` is new.

```typescript
type PersonPayload = {
  name: string           // 1-60 chars, required
  relationship: string   // 0-40 chars, a tag such as "Cousin" or "Old teammate"
  rhythmDays: number     // integer 1..365
  lastContactAt: number  // timestamp of the last contact, set only when adding
}

type PersonPolicyData = {
  lastContactAt: number  // freshness decays from this, never from item.lastEventAt
}

type ContactEvent = { kind: "text" | "call" | "meetup" }

// The Ghosted policy implements DecayPolicy<PersonPayload, PersonPolicyData, ContactEvent>
```

## Requirements

### Requirement 1: Straight-Line Decay Policy

**User Story:** As someone keeping in touch, I want a window to dim steadily after our last contact, so that I can see who I am losing touch with before they go dark.

#### Acceptance Criteria

1. THE policy thresholds SHALL be `{ weak: 60, dead: 10 }`.
2. WHEN `init(payload, now)` is called, THE policy SHALL return `{ lastContactAt: payload.lastContactAt }`.
3. WHEN `healthAt(item, now)` is called, THE policy SHALL compute `elapsed = max(0, now − item.policyData.lastContactAt)` and `T = 3 × item.payload.rhythmDays × DAY_MS`, and return `max(0, 100 × (T − elapsed) / T)`, evaluated in that order.
4. THE `healthAt` function SHALL read neither `item.lastEventAt` nor `item.health`, so that the engine moving `lastEventAt` forward on every tick never changes the result.
5. WHERE `policyData.lastContactAt` is later than `now`, WHEN `healthAt` is called, THE policy SHALL return exactly 100.
6. WHERE no contact is logged between two times t1 ≤ t2, THE value `healthAt(item, t2)` SHALL be less than or equal to `healthAt(item, t1)`.
7. THE `healthAt` function SHALL always return a finite number from 0 to 100 inclusive.

### Requirement 2: Contact Events

**User Story:** As someone keeping in touch, I want a quick text to brighten a window a little and a call or meet-up to light it fully, so that the light reflects the kind of contact.

#### Acceptance Criteria

1. WHERE a person receives `{ kind: "text" }` at `now` with current freshness `h = healthAt(item, now)`, WHEN `applyEvent` is called, THE policy SHALL return `health = min(100, h + 40)` and `policyData.lastContactAt = now − (100 − health) / 100 × T`, so that `healthAt` at `now` gives the new health.
2. WHERE a person receives `{ kind: "call" }` or `{ kind: "meetup" }` at `now`, WHEN `applyEvent` is called, THE policy SHALL return `health = 100` and `policyData.lastContactAt = now`.
3. WHEN `applyEvent` returns, THE value `healthAt(updatedItem, now)` SHALL equal the returned health within 1e-9.
4. THE `applyEvent` function SHALL never return a health lower than `healthAt(item, now)`.

### Requirement 3: Next Due

**User Story:** As someone keeping in touch, I want to know when a window will start to flicker, so that I can reach out before it does.

#### Acceptance Criteria

1. WHERE `healthAt(item, now)` is 60 or more, WHEN `nextDueAt(item, now)` is called, THE policy SHALL return `policyData.lastContactAt + 2 × T / 5`, the moment freshness reaches 60 and then falls below it. Written this way, the result is a whole number of milliseconds for every rhythm, which keeps the day-36 boundary of a 30-day rhythm exact.
2. WHERE `healthAt(item, now)` is below 60 and at least 10, WHEN `nextDueAt` is called, THE policy SHALL return `now`.
3. WHERE the item's state is `"dead"` or `healthAt(item, now)` is below 10, WHEN `nextDueAt` is called, THE policy SHALL return `null`.

### Requirement 4: Reconnect (Resurrect)

**User Story:** As someone keeping in touch, I want a dark window to light up again when they reply, so that a lost connection can come back.

#### Acceptance Criteria

1. WHEN `resurrect(item, event, now)` is called with any contact kind (`"text"`, `"call"` or `"meetup"`), THE policy SHALL return `{ ok: true, policyData: { lastContactAt: now } }`.
2. THE `resurrect` function SHALL have no failing case: it SHALL never return `{ ok: false }` for a valid `ContactEvent`.
3. WHEN a reconnect succeeds, THE engine sets health to 100 (engine Requirement 8.5), and `healthAt` at `now` SHALL also be 100, so that a dark window always comes back fully lit, whatever kind of contact was logged.

### Requirement 5: Policy Tests and Expected Outcomes

**User Story:** As the developer, I want the Ghosted policy proven against hand-calculated outcomes, so that the decay rules do what the spec says.

#### Acceptance Criteria

1. WHEN the tests run, THE policy SHALL pass `checkPolicy` with sample payloads covering rhythms of 1, 30 and 365 days and every contact kind.
2. WHERE a person has a 30-day rhythm, was last contacted at T0 and is never tended, WHEN viewed through the engine, THE person SHALL be alive on day 36 (health exactly 60), weak on day 37 (about 58.9), still weak on day 81 (health exactly 10) and dead on day 82 (about 8.9).
3. WHERE that person is ticked at day 90, THE recorded `diedAt` SHALL be later than T0 + 81 days and no more than 1 minute after it.
4. WHERE that person is ticked at day 90, THE alive-to-weak "state-changed" entry SHALL be later than T0 + 36 days and no more than 1 minute after it.
5. WHERE the person from criterion 2 receives a text on day 45 (health 50), THE resulting health SHALL be 90 (last contact moves to day 36), and the person SHALL next reach 60 on day 72.
6. WHERE the person from criterion 2 receives a call or a meet-up on day 45, THE resulting health SHALL be 100 and the person SHALL go weak just after day 81.
7. WHERE the person is dead on day 90 and a reconnect is logged with a text, THE person SHALL be alive with health 100 and `timesResurrected` 1.
8. THE tests SHALL live in `apps/ghosted/src/policy.test.ts`, use a fixed T0 and day offsets, and never read the real clock.

### Requirement 6: Splash (Brief Part 1)

**User Story:** As a visitor, I want a short opening where the windows light up, so that the street feels alive before I start.

#### Acceptance Criteria

1. WHEN the app opens for the first time in a browser tab, THE app SHALL show a splash where six windows light up one by one, followed by the "Ghosted" neon sign in Monoton and a "Walk in" button.
2. WHERE the splash has been shown or dismissed once in the current tab, WHEN the page is reloaded in that tab, THE app SHALL NOT show the splash again.
3. WHERE the user prefers reduced motion, WHEN the app opens, THE app SHALL skip the splash and show the main page.
4. WHEN the user activates "Walk in" or presses Escape, THE app SHALL close the splash and move focus to the hero heading.

### Requirement 7: Header Sign (Brief Part 2)

**User Story:** As a visitor, I want the logo to look like a neon sign, so that the app has its own character.

#### Acceptance Criteria

1. WHEN the page renders, THE header SHALL show "Ghosted" in Monoton with a neon glow in `--sign`, and the tagline "People you are losing touch with".
2. WHERE the user has no reduced-motion preference, THE sign SHALL play a slow hum flicker inside `@media (prefers-reduced-motion: no-preference)`.
3. WHERE the user prefers reduced motion, THE sign SHALL be steady.
4. THE sign's text SHALL be the page's `h1`.

### Requirement 8: Hero (Brief Part 3)

**User Story:** As someone keeping in touch, I want the top of the page to tell me who needs attention and give me one thing to do, so that I can act without reading every list.

#### Acceptance Criteria

1. WHERE N people are fading, WHEN the hero renders, THE hero SHALL say "N windows are flickering" (or "1 window is flickering") and show one primary button "Reach out to <name>" for the fading person with the lowest freshness, ties broken by item ID.
2. WHERE nobody is fading and at least one window is dark, THE hero SHALL say "Nobody is fading." and show one primary button "See the empty windows" that moves to that list.
3. WHERE every window is lit, THE hero SHALL say "Every window is lit." and show one primary button "Look at the street".
4. WHEN the hero renders, THE hero SHALL show three large counters for lit, flickering and boarded up, using the shell's `Counters`, each with its glyph and word.
5. WHERE a preview is active, THE hero's counters and message SHALL reflect the previewed day, and its primary button SHALL be disabled with the reason "Future preview · nothing is saved".
6. THE hero SHALL contain exactly one primary (filled) button.
7. WHERE no people exist (for example after "Start empty"), THE hero SHALL say "No windows yet." and show one primary button "Add a person".

### Requirement 9: Triage Panel (Brief Part 4)

**User Story:** As someone short on time, I want to say how many minutes I have and see who to reach first, so that my time goes where it counts.

#### Acceptance Criteria

1. WHEN the Triage panel renders, THE app SHALL use the shell's `TriagePanel` with budget choices of 15, 30, 60 and 120 minutes (Requirement 27), plus the shell's custom choice.
2. WHEN the panel renders, THE app SHALL explain the rule in three short steps: only fading windows are considered; the dimmer and more important the person, the more reaching out is worth; the picks give the most worth per minute that fits the time. *(Amended by Requirement 33.3:)* the steps sit inside a disclosure labelled "How does this work?", closed by default, so the budget form and the picks are seen first.
3. WHERE triage returns picks, THE panel SHALL show each pick's name, worth per minute, minutes and "goes dark in N days".
4. WHERE at least one fading person's `costMinutes` is 5 or less, THE panel SHALL show "Today's 5-minute action: Reach out to <name>" for the pick with the best worth per minute among those people.
5. WHEN the user starts the session, THE app SHALL open the Reach out dialog for each pick in order.

### Requirement 10: The Street (Brief Part 5)

**User Story:** As someone keeping in touch, I want to see everyone as windows on a street, so that I can take in the whole picture at a glance.

#### Acceptance Criteria

1. WHEN the Street renders, THE app SHALL show houses with each person as one window, labelled with the person's name.
2. THE Street SHALL group people into houses by relationship tag, with people without a tag in one house named "Others", and SHALL show every person exactly once.
3. WHEN the Street renders, THE app SHALL show a legend with the circle "lit", triangle "flickering" and cross "boarded up" glyphs and words.
4. WHEN the user activates a window, THE app SHALL open that person's card.
5. THE Street SHALL say that the light shows how recently the user was in touch and does not measure how much anyone matters.

### Requirement 11: The Three Lists (Brief Part 6)

**User Story:** As someone keeping in touch, I want people sorted into Still lit, Fading and Empty windows, so that I can see what each group needs.

#### Acceptance Criteria

1. WHERE a person is weak, THE app SHALL show them in "Fading", lowest freshness first, ties broken by item ID.
2. WHERE a person is dead, THE app SHALL show them in "Empty windows", most recently dark first (the engine's graveyard order).
3. WHERE a person is alive, THE app SHALL show them in "Still lit", soonest to fade first, each with "starts fading in N days".
4. EACH list SHALL have its own lighting from the Ghosted tokens (glow for Still lit, flick for Fading, dark for Empty windows) and a count badge.
5. A section navigation SHALL list the Street and the three lists with their counts, and activating an entry SHALL move focus to that section's heading.
6. WHERE a list is empty, THE app SHALL show one line saying so in the list's own words, and SHALL NOT leave an empty column beside other content.

### Requirement 12: Moon-Clock Dock (Brief Part 7)

**User Story:** As someone keeping in touch, I want to drag ahead in time and watch the street age, so that I can see who will fade or go dark if I do nothing.

#### Acceptance Criteria

1. THE dock SHALL be fixed at the bottom of the viewport and SHALL use the shell's `TimeMachine` with a range of 365 days and jumps of +30, +90, +180 days and +1 year (Requirement 26).
2. WHEN the user moves the slider to an offset of D days, THE app SHALL show `engine.view(today + D days)` in the hero, Street, lists and cards, and set `--age` to D / 365.
3. WHEN the slider moves, THE moon SHALL move across the dock's sky in proportion to D / 365.
4. THE dock SHALL show a marker for each person at the day they start fading and the day they go dark, when that day falls within 365 days, each marker with its glyph and an accessible name such as "Mira Castell goes dark on 3 March".
5. WHILE a preview is active, THE app SHALL show the shell's `PreviewBanner` ("Future preview · nothing is saved") and disable every write action: add, edit, remove, reach out, reconnect, restore, import and loading sample people.
6. WHEN the user activates "Back to today", THE app SHALL reset the offset to 0 and re-enable write actions.
7. THE page SHALL set `scroll-padding-bottom` at least as tall as the dock, so that a focused element is never hidden behind it.

### Requirement 13: Person Card (Brief Part 8)

**User Story:** As someone keeping in touch, I want one card that shows everything about a person, so that I can decide what to do.

#### Acceptance Criteria

1. WHEN a person's card renders, THE card SHALL show the name, relationship tag, "last contact N days ago" (from the latest logged contact in `engine.history(id)`, a "tended" or "resurrected" entry, or from `payload.lastContactAt` when there is none, so that a text sent today reads "today"; never from `policyData.lastContactAt`), "usual rhythm every N days", the window with its light, and a health bar.
2. THE health bar SHALL show marks at 60 (weak) and 10 (dead), and SHALL never be the only display of freshness: the window is always shown with it.
3. WHERE the person is alive or weak, THE card SHALL show one primary "Reach out" button; WHERE the person is dead, THE card SHALL show one primary "Reconnect" button and an "Autopsy" button.
4. THE card SHALL show "Edit" and "Remove" as quiet (outlined) buttons, each with a tap target at least 44 × 44 CSS pixels.
5. WHEN the user activates "Remove", THE app SHALL ask "Remove <name>? This cannot be undone." and SHALL call `engine.remove` only after the user confirms.
6. THE card SHALL show a history link that lists the person's contacts, newest first, with date, kind and freshness after each.

### Requirement 14: Reconnect Dialog (Brief Part 9)

**User Story:** As someone who heard back from a person whose window went dark, I want to log that contact and watch the light return, so that the reconnection feels real.

#### Acceptance Criteria

1. WHEN the user activates "Reconnect" on a dark window, THE app SHALL open a dialog that shows the boarded window and asks which contact happened: "Sent a message", "Had a call" or "Met up".
2. WHEN the user picks one, THE app SHALL call `engine.resurrect(id, { kind }, now)` with `"text"`, `"call"` or `"meetup"`.
3. WHEN the reconnect succeeds, THE dialog SHALL show the boards falling away and the light returning, and say "<name>'s window is lit again. Freshness is 100."
4. WHERE the user prefers reduced motion, THE dialog SHALL show the lit window at once with the same text.
5. THE dialog SHALL NOT offer a "No reply yet" option, because it would need an event kind the policy does not have.
6. THE dialog SHALL offer "Cancel", which closes it without calling the engine.

### Requirement 15: Privacy Line (Brief Part 10)

**User Story:** As a visitor, I want to know where my data lives, so that I can trust the app.

#### Acceptance Criteria

1. WHEN the page renders, THE app SHALL show "Everything stays in this browser. Names here are made up." below the lists.
2. WHERE the user has added at least one person of their own, THE line SHALL read "Everything stays in this browser."

### Requirement 16: State Shown by Light, Glyph and Word

**User Story:** As a user who may not see colour well, I want every state shown in more than one way, so that I never have to guess.

#### Acceptance Criteria

1. WHEREVER a person's state is shown (window, card, list, Street, triage, dock markers), THE app SHALL show the window light, the state glyph (circle, triangle or cross) and the state word ("lit", "flickering" or "boarded up"). THE counters SHALL show the state glyph and the list name ("Still lit", "Fading" or "Empty windows").
2. WHERE a person was reconnected and has not been dark since, THE card SHALL use the word "lit again" with the circle glyph.
3. THE window's background, glow and silhouette opacity SHALL read `--lit = health / 100`.
4. WHERE a person is weak, THE window SHALL flicker, inside `@media (prefers-reduced-motion: no-preference)` only.
5. WHERE a person is dead, THE window SHALL be dark and boarded up, with no silhouette.

### Requirement 17: Add and Edit a Person

**User Story:** As someone keeping in touch, I want to add people and change their details, so that the street matches my life.

#### Acceptance Criteria

1. WHEN the user opens "Add a person", THE form SHALL ask for name (required, 1-60 characters), relationship tag (optional, up to 40 characters), usual rhythm in days (required, integer 1-365), last contact date (required, not later than today), importance (1, 2 or 3) and minutes it takes to reach out (integer 1-600).
2. WHEN the form is saved, THE app SHALL call `engine.addItem({ payload, importance, costMinutes }, now)` with `payload.lastContactAt` taken from the chosen date.
3. WHERE the chosen last contact date is so long ago that the person starts dead, THE form SHALL say so before saving ("This window starts dark").
4. WHEN the user edits a person, THE form SHALL allow changes to name, relationship tag, rhythm, importance and minutes, and SHALL call `engine.edit` with only the changed fields.
5. THE edit form SHALL show the last contact date read-only, with the hint "Log a contact to change this", because `engine.edit` never changes `policyData`.
6. WHERE the rhythm is changed on a person who is not dead, THE card SHALL show the new freshness right after saving (the engine recomputes health on edit).
7. WHERE a field is invalid, THE form SHALL name the field and the rule, keep the user's input, and not save.
8. WHERE saving fails because storage is full or unavailable, THE form SHALL stay open with the user's input and show the problem.

### Requirement 18: Reach Out Logs a Real Action

**User Story:** As someone keeping in touch, I want "Reach out" to record what I actually did, so that the light stays honest.

#### Acceptance Criteria

1. WHEN the user activates "Reach out" on a lit or flickering window, THE app SHALL open a dialog with three choices: "Sent a message", "Had a call" and "Met up", each showing the freshness before and after ("Freshness 42 → 82").
2. WHEN the user picks one, THE app SHALL call `engine.tend(id, { kind }, now)` with `"text"`, `"call"` or `"meetup"`.
3. THE app SHALL NOT offer any control that marks a person as contacted without picking one of the three actions.
4. WHEN the tend succeeds, THE dialog SHALL say the result ("Mira is a little brighter. Freshness 42 → 82." or "Mira is lit again.") and when to reach out next to keep the window lit.
5. THE dialog SHALL offer "Cancel", which closes it without calling the engine.

### Requirement 19: Autopsy

**User Story:** As someone who lost touch with a person, I want to see how it happened, so that I can learn from it.

#### Acceptance Criteria

1. WHEN the user opens a dark window's autopsy, THE app SHALL call `engine.autopsy` and show the result in the shell's `AutopsyDialog`.
2. THE chart SHALL show freshness from the start of this life to going dark, with text, call and meet-up markers drawn by the marker renderer of Requirement 28, and a legend naming each marker kind.
3. THE cause-of-death sentences SHALL come from `apps/ghosted/src/autopsy-sentences.ts`, which turns the autopsy report into sentences such as "After the last call there was no contact for 84 days, about 3 times your usual rhythm."
4. THE sentences SHALL use the Ghosted wording rules (Requirement 31).
5. THE dialog SHALL offer "Reconnect", which opens the reconnect dialog (Requirement 14), and SHALL disable it during a preview.
6. WHERE a person was added already dark (engine history has "created" and "died" at the same timestamp), THE autopsy sentences SHALL describe the gap from `payload.lastContactAt` to the time they went dark (`diedAt`), for example "Already dark when added: no contact for 95 days, about 3 times your usual rhythm.", and SHALL never say "0 days".

### Requirement 20: First Run and Sample People

**User Story:** As a new visitor, I want to see a lived-in street quickly or start my own, so that I can try the app in seconds.

#### Acceptance Criteria

1. WHERE no stored data exists, WHEN the app opens, THE app SHALL land on the hero (not a list), and the hero SHALL offer "Load sample street" as its one primary action and "Start empty" as a quiet one.
2. FROM the first page load, THE user SHALL reach a loaded sample street in at most two clicks ("Walk in", then "Load sample street"); where the splash is skipped, in one click.
3. WHEN sample data loads, THE app SHALL add 12 fictional people with unique full names, by replaying dated adds and contacts through the engine and then ticking at `now`.
4. WHEN sample data has loaded, THE street SHALL contain at least 3 lit, 3 flickering and 3 boarded-up people at `now`, and at least one person whose contacts include each kind.
5. THE sample SHALL use rhythms from at least 4 different values between 7 and 120 days, and all three importance levels.
6. WHEN the user chooses "Start empty", THE app SHALL open "Add a person".
7. WHEN the user confirms "Reset all data" ("Reset all data? This cannot be undone."), THE app SHALL clear Ghosted's storage keys only and restart the first-run flow.
8. AT least one boarded-up sample person SHALL have started dark: added with a last contact date more than 2.7 × rhythm days before the time they were added, so that their history has "created" and "died" at the same timestamp (the case in Requirement 19.6).
9. WHEN the user chooses "Start empty" and has no people, THE street SHALL show the hero of Requirement 8.7 and no empty lists beside it (Requirement 11.6 still applies).

### Requirement 21: Backup, Restore and Import

**User Story:** As someone keeping in touch, I want to save my street to a file and bring people in from a list, so that clearing the browser does not lose them.

#### Acceptance Criteria

1. THE app SHALL have its own backup module in `apps/ghosted/src/`, a copy of the Study Dungeon pattern with no import from `apps/study-dungeon`.
2. WHEN the user backs up, THE app SHALL download a JSON file `{ app: "ghosted", version: 1, exportedAt, snapshot }` holding the stored engine snapshot.
3. WHEN the user restores a file, THE app SHALL check it by building a real engine from the snapshot before replacing anything, and SHALL replace stored data only after the user confirms.
4. WHERE the file is not JSON, is a backup from another app, or comes from a newer version, THE app SHALL say which and change nothing.
5. WHEN the user imports pasted text, THE app SHALL read one person per line as `name | relationship | rhythm days | last contact (YYYY-MM-DD)`, with tabs and CSV also accepted, the relationship and date optional, and the date defaulting to the import day. Every imported person SHALL get importance 2 and 10 minutes.
6. WHERE an import line breaks a form rule (Requirement 17.1), THE app SHALL skip it and report its line number and reason, and add every valid line.

### Requirement 22: Forecast Control

**User Story:** As someone keeping in touch, I want to see who will go dark soon, so that I can plan ahead.

#### Acceptance Criteria

1. WHEN the forecast control renders, THE app SHALL offer 7, 30 and 90 days, with 30 selected by default.
2. WHEN the user picks a horizon of H days, THE app SHALL call `engine.forecast(now, H × DAY_MS)` and list each person with "goes dark on <date>", soonest first.
3. WHERE nobody goes dark within the horizon, THE control SHALL say "Nobody goes dark in the next H days."
4. WHERE a preview is active, THE forecast SHALL use the previewed time as `now`.

### Requirement 23: Storage in the Browser

**User Story:** As someone keeping in touch, I want my people to stay in my browser, so that no one else sees who I talk to.

#### Acceptance Criteria

1. WHEN creating the engine, THE app SHALL use `LocalStorageAdapter` with namespace `"ghosted"` (key `decay-engine:ghosted`).
2. THE app SHALL make no network requests at run time: no analytics, no remote fonts and no contact imports from outside services.
3. WHERE storage is full or unavailable, THE app SHALL show the problem and keep the in-memory state unchanged (engine Requirement 12.6).

### Requirement 24: Keyboard, Focus and Layout

**User Story:** As a keyboard or small-screen user, I want every part of the app to work for me, so that I am not left out.

#### Acceptance Criteria

1. EVERY interactive element SHALL be reachable with Tab and work with Enter or Space; nothing SHALL depend on hover alone.
2. WHEN a dialog opens, THE app SHALL move focus to the dialog's content (its heading or first paragraph, with `tabindex="-1"`), not to a button, keep focus inside the dialog, and close it on Escape.
3. WHEN a dialog closes, THE app SHALL return focus to the element that opened it, or to the hero heading if that element is gone.
4. AT a viewport width of 320px, THE page SHALL have no horizontal scrolling, and the dock SHALL still show the slider, "Back to today" and the jumps (scrolling sideways inside the dock if needed).
5. THE focus outline SHALL be visible on every focusable element against its background.
6. ALL text SHALL meet WCAG AA contrast against its background, checked by a test over the Ghosted tokens.
7. THE layout SHALL be full width up to 1080px, with no column left beside empty space.

### Requirement 25: Reduced Motion

**User Story:** As a user who is bothered by motion, I want the street to stay still, so that the app is comfortable.

#### Acceptance Criteria

1. EVERY animation and transition (splash, sign hum, window flicker, boards falling, relight flash, moths, fog, headlights, moon movement, smooth scrolling) SHALL sit inside `@media (prefers-reduced-motion: no-preference)`.
2. WHERE the user prefers reduced motion, THE app SHALL show the end state of each change at once.
3. WHERE the user prefers reduced motion, THE time machine's Play button SHALL jump straight to the end (the shell's existing behaviour).

### Requirement 26: Shell Addition: Time Machine Range and Jumps

**User Story:** As an app developer, I want to set the time machine's range and jump buttons, so that a slow-decaying app can look a year ahead.

#### Acceptance Criteria

1. THE shell `TimeMachine` SHALL accept an optional maximum range in days and an optional list of jump days.
2. WHERE neither is given, THE `TimeMachine` SHALL behave exactly as today: 60 days, jumps of 7, 14 and 30, and the same exported constants.
3. WHERE a range is given, THE slider maximum, the Play animation's end and the clamp on `onChange` SHALL all use it.
4. WHERE a jump list is given, THE `TimeMachine` SHALL show one jump button per entry, in order.
5. A new shell test SHALL prove a 365-day range with jumps of 30, 90, 180 and 365 works, and the existing shell tests and Study Dungeon tests SHALL pass without modification.

### Requirement 27: Shell Addition: Triage Budget Choices

**User Story:** As an app developer, I want to set the Triage budget choices, so that each app offers sensible amounts of time.

#### Acceptance Criteria

1. THE shell `TriagePanel` SHALL accept an optional list of budget choices in minutes.
2. WHERE no list is given, THE `TriagePanel` SHALL behave exactly as today: 5, 10 and 20 minutes plus custom, and `TRIAGE_BUDGETS` unchanged.
3. WHERE a list is given, THE panel SHALL show those choices plus custom, and `initialBudget` SHALL be checked against that list.
4. A new shell test SHALL prove choices of 15, 30, 60 and 120 work, and the existing shell tests and Study Dungeon tests SHALL pass without modification.

### Requirement 28: Shell Addition: Autopsy Chart Markers

**User Story:** As an app developer, I want to draw my own tend markers on the autopsy chart, so that the chart fits events that are not right or wrong answers.

#### Acceptance Criteria

1. THE shell `AutopsyDialog` SHALL accept an optional list of markers, each with a time, a kind and a label, and an optional renderer, and SHALL draw each marker inside the chart's time span and its legend entry from that app data. WHERE no renderer is given, each marker SHALL be drawn as a plain filled circle.
2. WHERE no markers are given, THE `AutopsyDialog` SHALL behave exactly as today: right and wrong marks, the same legend and the same accessible chart summary.
3. WHERE markers are given, THE chart's accessible summary SHALL describe them in the app's words (for example "3 calls, 2 messages, 1 meet-up") instead of right and wrong counts, and THE legend SHALL list one entry for each kind that has at least one marker inside the chart's time span.
4. A new shell test SHALL prove text, call and meet-up markers render with their legend, and the existing shell tests and Study Dungeon tests SHALL pass without modification.
5. THE shell AutopsyDialog SHALL accept an optional prop that moves focus to the dialog's content when it opens; WHERE it is not given, THE dialog SHALL behave exactly as today. A new shell test SHALL prove both.

### Requirement 29: Engine Unchanged

**User Story:** As the developer, I want proof that Ghosted needed no engine change, so that the core promise holds.

#### Acceptance Criteria

1. THE Ghosted work SHALL make zero changes under `packages/engine/`.
2. A check (`scripts/check-engine-unchanged.sh`, called by `scripts/check.sh`) SHALL work out the state before the Ghosted work from git history (the parent of the first commit that added anything under `.kiro/specs/ghosted`, or HEAD when nothing about Ghosted is committed yet), with no recorded file, and SHALL run `git diff --exit-code <that commit> -- packages/engine` and `git status --porcelain --untracked-files=all -- packages/engine`, failing if either reports a change. On a shallow clone, where that history is missing, it SHALL say it was skipped and not fail.
3. WHERE Ghosted seems to need an engine change, THE work SHALL stop and the need SHALL be reported (`engine-boundary.md`).
4. CHANGES under `packages/shell/` SHALL be limited to Requirements 26 to 28 and 36.11, and the same check SHALL fail when a shell file outside the files those requirements name (including every existing shell test) differs from that state. Requirement 32 needs no shell change; WHERE it turns out to need one, THE work SHALL stop and report it rather than widen this list. (Amended for task P5: Requirement 36.11 adds one optional TriagePanel prop and one new shell test file.)

### Requirement 30: Look and Fonts

**User Story:** As a visitor, I want the app to look like the approved wireframe, so that it feels finished.

#### Acceptance Criteria

1. THE app SHALL use only the Ghosted tokens from `design-tokens.md`, mapped onto the shell's theme roles.
2. THE app SHALL bundle Monoton and Josefin Sans (and Spectral and IBM Plex Mono) with `@fontsource` packages, and SHALL never load fonts from `fonts.googleapis.com` or `fonts.gstatic.com`.
3. THE art SHALL be CSS and inline SVG only, with no images or icon libraries.
4. EACH screen region SHALL have at most one primary (filled) button of the app's own; WHERE a shell control (the time machine's Play, Triage's Run or Start the session) is the region's primary action while shown, THE app's own primary button SHALL be hidden or shown as quiet at that moment.
5. Side by side with the wireframe at 1280px and 390px, THE app SHALL show the same street, windows, sign and dock (a manual check, recorded with screenshots).

### Requirement 31: Wording

**User Story:** As someone keeping in touch, I want the app to describe contact without judging anyone, so that it never feels like blame.

#### Acceptance Criteria

1. THE app SHALL describe the light as connection freshness, never as how much someone cares.
2. NO interface text, sample data or autopsy sentence SHALL contain "doesn't care", "ignored you" or "ghosted you", checked by a test over every wording string and every sample person.
3. THE app SHALL use "fading", "went dark", "still lit" and "empty windows" for the states and lists.

### Requirement 32: App Runs and Is Checked

**User Story:** As the developer, I want Ghosted to run, build and be checked like Study Dungeon, so that it ships as a working app and breakages are caught.

#### Acceptance Criteria

1. THE `apps/ghosted` package SHALL have a Vite and React entry (`index.html`, `vite.config.ts`, `src/main.tsx`) and the scripts `dev`, `build`, `preview`, `test` and `typecheck`, modelled on `apps/study-dungeon`, with the shared shell and the `@fontsource` packages as dependencies.
2. THE `scripts/check.sh` script SHALL include Ghosted's install, typecheck, test and build steps, and SHALL exit with a non-zero code when any of them fails.
3. WHEN `pnpm --filter @decay-engine/ghosted build` runs, THE output SHALL be a static bundle whose asset paths work when served from the site root, so that it can be deployed as its own URL.
4. THE Ghosted `vite.config.ts` SHALL set `test.testTimeout` to 20000, so that its tests do not rely on Vitest's default 5-second timeout.
5. THE README SHALL describe Ghosted as built and give its run command (`pnpm --filter @decay-engine/ghosted dev`).

### Requirement 33: The Street on the First Screen (task L1)

**User Story:** As someone opening Ghosted, I want to see the street of windows straight away, so that I take in everyone's connection freshness before anything else.

#### Acceptance Criteria

1. WHILE there is at least one person, THE App SHALL render inside `<main>`, in this order: the hero, the Street, the section navigation, Triage, the three lists, the forecast, the toolbar and the privacy line.
2. WHEN the sample data is loaded and the viewport is 1280×800 or 390×844, THE first row of windows SHALL be fully visible in the viewport without scrolling, measured with the dock as it is when the check runs. (The check is re-run after task L2 changes the dock.)
3. WHEN Triage renders, THE three steps (Req 9.2) SHALL sit inside a native `<details>` element, closed by default, whose `<summary>` reads "How does this work?". Opening it SHALL show the three steps in order, as an ordered list named by the summary.
4. THE change SHALL keep: the preview write guard, focus on the hero heading and the Street heading through their refs, the section navigation moving focus to each section's heading, and a Tab order that follows the DOM (design section 9.5).
5. THE new text SHALL come from `wording.ts`, and the banned-phrase wording tests SHALL still pass.
6. THE change SHALL not touch `packages/engine/` or `packages/shell/`, and SHALL add no colour outside the Ghosted tokens.

### Requirement 34: A Compact Moon Dock (task L2)

**User Story:** As someone reading the street, I want the moon dock to stay small until I need it, so that it does not cover the windows and cards under it.

#### Acceptance Criteria

1. WHEN the page loads with no remembered choice, THE dock SHALL be collapsed: one slim bar with the moon at its small size, the time machine title, the shown date line (today's date, or the previewed date) and the slider.
2. WHILE the dock is collapsed, THE quick jumps, Play, the marker track, its tick labels and the marker list (34.6) SHALL not be shown and SHALL not be reachable with Tab.
3. WHEN the user activates the toggle, THE dock SHALL expand and show everything in 34.2; activating it again SHALL collapse it. The toggle SHALL be a native `<button>` with `aria-expanded`, the visible name "Coming up" from `wording.ts` (the same in both states and in both apps), a target of at least 44×44 px, and a quiet (not filled) style.
4. WHEN the dock collapses or expands, THE preview offset SHALL stay the same. WHILE previewing, THE preview banner with "Back to today" SHALL stay visible in the collapsed bar, and every write SHALL stay blocked (Req 12.5). Moving the slider while collapsed SHALL change the preview as it does when expanded.
5. WHEN the user expands or collapses the dock, THE choice SHALL be kept in `sessionStorage` (through the App's existing `session` prop) and restored on a reload in the same tab. WHERE `sessionStorage` cannot be used, THE choice SHALL last until the page is closed. No `localStorage` key SHALL be added.
6. WHEN the dock is expanded, EACH marker SHALL show a short visible label on hover and on keyboard focus: "<name> starts fading in N days" or "<name> goes dark in N days", where N is the marker's day from today. THE expanded dock SHALL also hold an ordered list of every marker in that wording, in marker order, hidden visually and read by screen readers. Each marker button SHALL keep its accessible name with the date (Req 12.4).
7. AT 320, 390 and 1280 px wide, THE collapsed bar SHALL not cover page content: the page's bottom padding and scroll padding SHALL be at least the dock's measured height, and SHALL follow it when the dock expands, collapses or shows the banner.
8. THE toggle and any change of size SHALL respect reduced motion: any transition sits inside `@media (prefers-reduced-motion: no-preference)` (Req 25.1).
9. Tab order SHALL follow the DOM: the dock stays after `<main>` and so last in the Tab order (Req 12, design section 9.5). Inside it: the slider, the toggle, then (when expanded) the markers, the jumps and Play, then "Back to today" when previewing.
10. ALL new text SHALL come from `wording.ts`, and the banned-phrase wording tests SHALL still pass. No colour outside the Ghosted tokens, no change to `packages/engine/` or `packages/shell/`.
11. WHILE the dock is collapsed, THE bar SHALL show a short hint from `wording.ts`, "Drag to look ahead". WHEN the dock is expanded, THE hint SHALL not be shown. A wording test SHALL cover the hint's words.
12. WHERE `ResizeObserver` is not available, THE dock SHALL set no measured height, and the page SHALL keep the CSS fallback room (today's `--dock-max` room).

### Requirement 35: The Loss Forecast Line (task P4)

**User Story:** As someone keeping in touch, I want the hero to tell me which windows change in the next 7 days if I do nothing, so that I see what I am about to lose on the first screen.

Terms: `realNow` is the App's real time (the last settle tick), never the previewed time. **The next 7 days** is the rolling window `(realNow, realNow + 7 × DAY_MS]`: it starts just after `realNow` and includes the moment exactly 7 days later. It is not a calendar week.

#### Acceptance Criteria

1. WHILE not previewing and at least one person is lit or flickering at `realNow`, THE hero SHALL show one line of plain text directly under its heading (the `h2`) and before its buttons, giving the number of windows that will start to flicker and the number that will go dark in the next 7 days.
2. A person SHALL be counted as **going dark** WHEN `engine.forecast(realNow, 7 × DAY_MS)` lists them: they are not dark at `realNow` and the engine shows them dark at `realNow + 7 × DAY_MS`.
3. A person SHALL be counted as **starting to flicker** WHEN they are lit at `realNow` (engine state `alive`), `ghostedPolicy.nextDueAt(person, realNow)` falls in the next 7 days, and they are not counted as going dark. A `nextDueAt` exactly at `realNow + 7 × DAY_MS` SHALL be counted, as the dock marks it on day 7.
4. EACH person SHALL be counted at most once. A person who starts to flicker and goes dark within the same 7 days SHALL be counted only as going dark. A person who is already flickering or already dark at `realNow` SHALL never be counted as starting to flicker.
5. THE counts SHALL come from the existing `dockMarkers` (`timeline.ts`) applied to `engine.view(realNow)` and `engine.forecast(realNow, 7 × DAY_MS)`, so the line agrees with the moon dock's markers for days 1 to 7. No policy formula SHALL be repeated in the new code.
6. WHEN both counts are 0, THE line SHALL read "No window will start to flicker or go dark in the next 7 days." Otherwise it SHALL use the sentences in design section 12.3.
7. WHILE previewing, THE line SHALL not be shown, and the rest of the hero SHALL stay as it is today (the preview eyebrow and the previewed counts; Ghosted's hero has no preview forecast line of its own). WHEN the user goes back to today, THE line SHALL show again.
8. ON the first run, on an empty street, and WHEN every person is dark at `realNow`, THE line SHALL not be shown.
9. THE line SHALL be worked out again after every write (`version`) and on every settle tick (`realNow`). It SHALL store nothing (no new `localStorage` or `sessionStorage` key) and SHALL make no network request.
10. THE line SHALL be a plain `<p>` in the hero, with no `aria-live`, no `role="status"` or `role="alert"`, and not inside a live region, so a screen reader is not told about it on every tick. It SHALL not be focusable. It SHALL use `--dim` text, an existing token whose pairs are in `contrast.test.ts`, with no new colour and no animation.
11. ALL its words SHALL come from `wording.ts` (`heroText.lossForecast`). They SHALL never contain "die", "dies", "died", "dying" or "dead": windows start to flicker and go dark. They SHALL pass the banned-phrase tests of Requirement 31.2. `wording.test.ts` SHALL get sample arguments for the new function (so the coverage test stays complete) and a case that checks its exact words. No existing check is removed or loosened.
12. THE change SHALL not touch `packages/engine/` or `packages/shell/`. The Requirement 29 check SHALL pass unchanged.
13. AFTER the line is added, Requirement 33.2 (the first row of windows fully visible at 1280×800 and 390×844) SHALL be measured again in a browser. WHERE it fails, the hero's padding and margins in `layout.css` MAY be tightened, and nothing else. WHERE it still fails, the work SHALL stop and report the measured heights of the sign, the hero and the Street heading. THE line SHALL never be hidden on small screens.

### Requirement 36: What This Session Saves (task P5)

**User Story:** As someone short on time, I want Triage to tell me how many of the people it picked would go dark in the next 7 days and stay lit if I call them, so that I see what my minutes keep.

Terms: `now` is the time the Triage panel runs at (the `now` GhostedTriage already receives). **The next 7 days** is the window `(now, now + LOSS_FORECAST_DAYS × DAY_MS]`, with `LOSS_FORECAST_DAYS` (7) imported from `loss-forecast.ts` (Requirement 35), not a new number. The **picks** are `engine.triage(budget, now).picks` for the budget the panel shows. A pick is **at risk** WHEN its `diesAt` is not `null` and is at or before `now + 7 days`. An at-risk pick is **kept** WHEN a call at `now` leaves its freshness at `now + 7 days` at or above the dead threshold (10), worked out with `ghostedPolicy.applyEvent` and `ghostedPolicy.healthAt` on a copy of the pick (design section 13.3).

#### Acceptance Criteria

1. WHEN Triage has run and shows at least one pick, and at least one pick is kept, THE panel SHALL show one line of plain text under the picks list and before the "Start reaching out" button, giving the number of kept picks.
2. THE number SHALL be the count of distinct pick ids that are kept. It SHALL be read from the picks of the triage result the panel shows, never from a second list or a second formula. A pick whose `diesAt` is `null`, or later than `now + 7 days`, SHALL not be counted. A pick whose `diesAt` is exactly `now + 7 days` SHALL be counted when it is kept.
3. Triage candidates are flickering people only (engine Requirement 17b). So a lit person and a dark person are never counted, and nor is a flickering person who is not a pick (the "Also fading" list).
4. AN at-risk pick that a call cannot keep lit for the next 7 days SHALL not be counted. (A call keeps a window from going dark for 2.7 × rhythm days, so a pick with a rhythm of 1 or 2 days goes dark within 7 days even after a call.) The line SHALL therefore never claim more than a call or meet-up gives.
5. THE line SHALL name the contact it assumes, "A call or meet-up", because a text adds 40 and may not keep a window lit for the next 7 days (design section 13.4). Its words SHALL come from `wording.ts` (`triageText.saves`), with a singular and a plural form (design section 13.5). They SHALL never contain "die", "dies", "died", "dying" or "dead", SHALL never say the light measures how much someone matters, and SHALL pass the banned-phrase tests of Requirement 31.2. `wording.test.ts` SHALL get sample arguments for the new function and a case that checks its exact words. No existing check is removed or loosened.
6. THE line SHALL not be shown before Triage has run, WHEN there are no picks (nobody is fading, or nobody fits the budget), or WHEN no pick is kept. It SHALL never say "0".
7. THE line SHALL follow the panel: it SHALL be worked out again whenever the panel works out its picks again (a new budget is run, `now` changes, or a write bumps `version`), and SHALL always describe the picks shown at that moment.
8. WHILE previewing, THE line SHALL follow the same rule at the previewed `now`, as the picks do. "Start reaching out" stays disabled with its reason, as today (Requirement 12.5).
9. THE line SHALL be a plain `<p>`, with no `aria-live`, no `role="status"` or `role="alert"`, not inside a live region and not focusable. It SHALL use `--dim` text on the Triage panel, a pair already in `contrast.test.ts`, with no new colour and no animation.
10. THERE SHALL be a gap of at least 8 px between the line and the last pick above it, and between the line and the "Start reaching out" button below it, at every width. No CSS rule SHALL hide the line at any width.
11. THE shell `TriagePanel` SHALL get one optional prop that returns the line's text for the picks shown (or `null` for no line), rendered as described in 36.1, 36.9 and 36.10. WHERE the prop is not given, THE panel SHALL render exactly as today. A new shell test file SHALL prove both, and the existing shell tests and Study Dungeon tests SHALL pass without modification. The new test file SHALL be added to the shell allow-list in `scripts/check-engine-unchanged.sh` (Requirement 29.4).
12. THE change SHALL not touch `packages/engine/`, SHALL store nothing (no new `localStorage` or `sessionStorage` key) and SHALL make no network request. `policy.ts` and `autopsy-sentences.ts` SHALL not be edited.
13. A property test (Property 15) SHALL prove that every counted pick, after a call at `now` (and, separately, a meet-up), is not dark at any time in the next 7 days, and that every at-risk pick not counted is dark at `now + 7 days` even after a call.

### Requirement 37: Rescue Point (task R1)

**User Story:** As someone looking at a dark window, I want one calm line that says how much longer the light would have stayed on after a call when the window first flickered, so that I see what one call at that moment was worth, without being blamed.

R1 depends on `@decay-engine/insight` (task E1, `.kiro/specs/insight/`). It uses only Insight's public API: `whatIf(policy, item, history, { at, event }, options?)` and `DEATH_TIME_PRECISION_MS`.

Terms:

- The **report** is `engine.autopsy(id, now)` for the dark person, at the dialog's `now` (the previewed time while previewing).
- **The good event** is `RESCUE_EVENT = { kind: "call" }`.
- **The what-if** is `whatIf(ghostedPolicy, person, engine.history(id), { at: report.wentWeakAt, event: RESCUE_EVENT })`, where `person` is the dark person from `engine.view(now)`.
- **P** is `DEATH_TIME_PRECISION_MS` (60,000 ms), imported from Insight.
- **The extra days** are `N = floor((diesAt − baselineDiesAt + P) / DAY_MS)`, from the what-if result (amended by the developer's decision, Session 66: P is added, not taken off).
- **The end date** is the calendar date of `diesAt` itself in the viewer's time zone (amended, Session 66).

#### Acceptance Criteria

1. WHEN the autopsy dialog of a dark window opens and the rescue point exists (37.3), THE dialog SHALL show one sentence: "A call on <date of at>, when the window started to flicker, would have kept the light on until <end date>, <N> days longer." For N = 1 it SHALL say "1 day longer". (Amended, Session 66: "first flickered" became "started to flicker".) The template SHALL live in `wording.ts` (`rescueText.sentence`), with sample calls in `wording.test.ts`.
2. THE good event SHALL be a call. A call lights the window fully (freshness 100, Requirement 2.2), as a meet-up does with the same `policyData`; a text adds only 40 (Requirement 2.1). A call is named because it is the smaller of the two full contacts.
3. THE sentence SHALL not be shown, and nothing SHALL take its place, WHEN any of these holds: `report.wentWeakAt` is `null` (including a person added already flickering or already dark, Requirement 19.6); the what-if returns `ok: false`; its `stoppedAt` is not `null`; its `diesAt` or `baselineDiesAt` is `null`; `baselineDiesAt` differs from `report.diedAt` by more than P (the replay does not reproduce the real darkening, for example after a rhythm edit); or N is less than 1.
4. THE date of `at`, the end date and N SHALL come only from the what-if result (`at`, `diesAt`, `baselineDiesAt`) and P. No policy formula SHALL be written in the new code, and no second time SHALL be worked out.
5. THE precision rule (amended, Session 66): N adds P to the difference, so a gain that is a whole number of days (any rhythm that is a multiple of 5) reads as that number, and the end date is the date of `diesAt`. Both come only from the what-if result.
6. DATES SHALL be formatted as the cause sentences of `autopsy-sentences.ts` format them, day, short month and year ("3 Oct 2026", locale `en-GB` by default), in the given time zone, the viewer's own when none is given (amended, Session 66). The options are copied into `rescue-sentence.ts`, because that file's formatter is not exported, and a test SHALL check that both give the same text for the same time.
7. THE words SHALL be neutral. They SHALL never contain "die", "dies", "died", "dying", "dead", "late", "later" or "should", SHALL never say the light measures how much anyone matters, and SHALL pass the banned-phrase tests of Requirement 31.2. `wording.test.ts` SHALL check the sentences of the sample's dark windows against `BANNED` and these words. No existing check is removed or loosened.
8. THE sentence SHALL be the second entry of the dialog's cause sentences, straight after the cause sentence from `autopsy-sentences.ts`, so the shell renders it as a plain `<p class="shell-autopsy-sentence">`. It SHALL not be in a live region, SHALL not be focusable and SHALL add no colour or animation. Focus SHALL still open on the dialog's title (Requirement 28.5).
9. FOR a window that was lit again, THE sentence SHALL describe the current life only (the life in the report). A dark window has no later reconnect, so the what-if's life cut never applies; WHEN `stoppedAt` is not `null` anyway, 37.3 applies.
10. WHILE previewing, THE sentence SHALL follow the same rules at the previewed `now`. It is read-only: it stores nothing, and Reconnect stays disabled with its reason (Requirement 19.5).
11. THE new code SHALL never read the clock. Time reaches it only through the report and the what-if result.
12. THE sentence SHALL be built in a new file `apps/ghosted/src/rescue-sentence.ts`, written by Kiro. `autopsy-sentences.ts` (Claude Code's) and `policy.ts` SHALL not be edited. `packages/engine/`, `packages/shell/` and `packages/insight/` SHALL not change, so the Requirement 29 check passes with its allow-list unchanged.
13. `apps/ghosted/package.json` SHALL list `"@decay-engine/insight": "workspace:*"` in `dependencies`. `netlify.toml` SHALL not change (pnpm installs the whole workspace, so Insight is built from source with the app, as the shell is). The `pnpm-lock.yaml` written by `pnpm install` SHALL be committed with it.
14. A property test (Property 16) SHALL prove, through the real engine and `ghostedPolicy`: the what-if darkening is later than the real one; the sentence's N equals `floor((diesAt − baselineDiesAt + P) / DAY_MS)` of the same what-if; and no sentence is shown WHEN `wentWeakAt` is `null`.

### Requirement 38: Live state changes (task L3)

**User Story:** As someone with the street open in a tab, I want to see when a window starts to flicker or goes dark on its own, so that the page feels alive and I notice the change even when the tab is in the background.

L3 starts after the R1 build is checked. Today the minute tick (`useSettleTicks`) moves people between lit, flickering and dark while the tab is open, and nothing on the screen reacts until the user looks.

Terms:

- **A tick** is one call of the App's tick handler by `useSettleTicks` (the settle tick every minute while not previewing, and the tick it runs on mount and after "Back to today").
- **The baseline** is each person's id and state as the last tick saw them.
- **A reported change** is lit → flickering, flickering → dark, or lit → dark in one tick (the three changes time can cause).

#### Acceptance Criteria

1. A NEW pure function `diffStates(before, after)` in a new file `src/state-changes.ts` SHALL return one `{ id, from, to }` for each item present in both lists whose state differs, in the order of `after`. It SHALL read only ids and states, read no clock, call no engine and repeat no policy formula. Items present in only one list SHALL not be changes. It SHALL change neither input. Its shape SHALL not depend on Ghosted, so task L5 (browser notifications) can reuse it.
2. WHEN a tick finds reported changes, THE card of each changed person SHALL react once: its window flickers out, by a CSS animation inside `@media (prefers-reduced-motion: no-preference)` only. The card SHALL carry the marker class `gh-just-changed` only until that animation ends, and the class SHALL then be removed. WHILE the user prefers reduced motion, THE class SHALL not be added.
3. WHEN a tick finds reported changes, THE App SHALL show ONE message (a toast) for the whole tick, with the sentences in design section 15.4: one window, two windows (the more important first), and three or more (counted, naming the most important person). Its words SHALL come from `wording.ts` (`liveText`). They SHALL say "started to flicker", "went dark" or "went from lit to dark", SHALL never contain "die", "dies", "died", "dying" or "dead", SHALL judge and blame nobody, and SHALL pass the banned-phrase tests of Requirement 31.2.
4. THE toast SHALL never cover the moon dock (`--dock-h`), the Triage panel or other content; SHALL stay a few seconds (about 6) with motion, and until Dismiss or the next tick without motion; SHALL have one quiet Dismiss button; and SHALL never take focus.
5. THE toast's words SHALL be said once through the App's existing polite live region (`#gh-announcer`, `announce`). No second live region SHALL be added: the toast has no `aria-live` and no `role`. Its only element in the Tab order SHALL be Dismiss. WHEN a tick's storage problem or the clock notice was said in the same tick, THE live region SHALL keep that message, and the toast SHALL be shown without being said.
6. WHILE the tab is hidden (`document.visibilityState` is `"hidden"`), each reported change SHALL add one to a count, and THE tab title SHALL be `(<n>) <title>`, with `(9+)` above 9. WHEN `visibilitychange` makes the tab visible, THE count SHALL be 0 and THE original title SHALL be restored exactly. WHILE the tab is visible nothing SHALL be counted.
7. WHILE the count is above 0, THE favicon SHALL carry a badge from an SVG data URL (no network request), with a shape as well as a colour (`design-tokens.md`): a triangle when windows only started to flicker, a cross when any went dark. The tab title SHALL be its text alternative, and the link's `title` SHALL hold the same words. At 0 the original favicon SHALL be restored exactly.
8. AT 320 px and 390 px the toast SHALL fit, cause no horizontal scroll, keep at least 8 px from everything around it, and SHALL never be hidden at any width.
9. THE change detection SHALL run only on a tick and only when not previewing. It SHALL never report on the first tick at mount, on the first tick after "Back to today", or for a change caused by the user's own write (the baseline is read again after every write).
10. THE App SHALL rely on `clock-guard.ts` (`heldClock`) for the tick time: it never runs behind the newest saved event, so every tick reaches the handler and the before and after views are never out of order. `clock-guard.ts` (Claude Code's) SHALL not be edited.
11. THE change SHALL not touch `packages/` (engine, shell, insight), `policy.ts` or `autopsy-sentences.ts`, SHALL store nothing and SHALL make no network request.

### Requirement 39: Notifications while the tab is open (task L5)

**User Story:** As someone with the street open in a background tab, I want an opt-in browser notification when a window starts to flicker or goes dark, so that I notice it without watching the tab, and I want the app to tell me plainly that it cannot reach me when the tab is closed.

L5 starts after the L3 build is checked. It adds one more consumer of L3's tick result (Requirement 38): the same `diffStates` and `liveNotice`, so a change that is notified is the same change that is toasted, in the same words.

Terms:

- **The setting** is the user's choice, stored under `ghosted:notify` (`"on"` or `"off"`) in the App's `storage` (the same `FlagStorage` the first-run flags use). Missing, unreadable or any other value means off.
- **The permission** is the browser's `Notification.permission` (`"default"`, `"granted"` or `"denied"`). **Supported** means the browser has a `Notification` API.
- **A tick's notice** is the `LiveNotice` that L3's tick handler builds (`liveNotice(diffStates(before, after), seen)`), or none.

#### Acceptance Criteria

1. THE setting SHALL be off by default. It SHALL be one switch below the toolbar ("Add a person", "Import people", "Back up", "Restore", "Reset all data") and above the privacy line, on every screen where the toolbar shows, labelled "Notify me about changes while this tab is open". It SHALL be a native `<button>` with `role="switch"` and `aria-checked`, quiet (never filled), at least 44 × 44 px, in the Tab order, with its visible state as a word ("On" or "Off") as well as the border colour.
2. THE permission request SHALL happen only inside the click that turns the setting on, and only WHEN the permission is `"default"`. It SHALL never happen at load, on a tick, when turning the setting off, or WHEN the permission is already `"granted"` or `"denied"`. A second click while a request is pending SHALL not start a second request.
3. THE setting area SHALL show exactly these states and sentences (design 16.4): **unsupported** (no switch; one sentence that the browser cannot show notifications); **off** (the switch, "Off"); **on** (the switch, "On", and one sentence on what happens); **denied** (the setting is off and the permission is `"denied"`: the switch stays, and one sentence says how to allow notifications in the browser; a click never asks again and only says that sentence once more through the live region); **blocked** (the setting is on but the permission is not `"granted"`: one sentence that the browser is blocking them, and the switch turns the setting off). WHEN the setting is supported, THE area SHALL also always show the honest limit, "There is no server, so nothing can notify you when this tab is closed or the computer is asleep.", and the privacy sentence, "A notification shows only what is already on this page, and nothing is sent anywhere."
4. THE setting SHALL be stored through the App's `storage` and SHALL survive a reload. WHEN reading it throws, it SHALL be off. WHEN saving it throws, THE switch SHALL still work until the page is closed, and one sentence SHALL say the choice cannot be saved. Nothing else in the app SHALL be affected.
5. A notification SHALL be shown only WHEN all of these hold, decided by one pure function `shouldNotify` (`src/notify.ts`): the setting is on; the permission is `"granted"`; `document.visibilityState` is `"hidden"`; the tick is not in a preview; it is not the first tick at mount (nor the first after "Back to today"); and the tick has a notice. WHEN the tab is visible, only the toast SHALL show.
6. EACH tick SHALL show at most one notification. Its title SHALL be "Ghosted" (`appText.name`) and its body SHALL be the notice's `text`, the same string the toast shows and the live region says. It SHALL carry the tag `ghosted-live`, so a later one replaces the earlier one. It SHALL be `silent: true`, with no `vibrate`, and its `icon` SHALL be the tab signal's data URL (`badgeIcon(notice.worst)`), so nothing is fetched.
7. WHEN the user clicks a notification, THE app SHALL call `window.focus()` and close that notification. It SHALL change no data and open no dialog.
8. THE words SHALL come from `wording.ts` (`notifyText`). They SHALL never say "die" or "dead" for a person, SHALL contain no guilt words ("forgot", "overdue", "late", "should"), and SHALL pass the banned-phrase tests of Requirement 31.2.
9. THE feature SHALL make no network request (the `no-network.test.ts` check passes unchanged) and SHALL add no live region: the switch's state is read from `aria-checked`, and the denied sentence after a click goes through the existing `#gh-announcer`. Nothing SHALL take focus when the state changes or a notification is shown.
10. WHERE the `Notification` constructor throws (some mobile browsers allow notifications only from a service worker), THE tick SHALL carry on as if no notification were due; the toast and the tab signal are unaffected.
11. AT 320 px and 390 px the setting SHALL fit with no horizontal scroll and at least 8 px from its neighbours; no rule SHALL hide it at any width.
12. THE setting is a preference, not data: it SHALL work while previewing (as Study Dungeon's sound switch does), and "Reset all data" SHALL leave it, as it leaves the splash flag (`RESET_KEYS` unchanged).
13. THE change SHALL not touch `packages/`, `policy.ts`, `autopsy-sentences.ts` or `clock-guard.ts`.

### Requirement 40: The First Ten Seconds (task L6)

**User Story:** As a first-time visitor, I want to see the street age by itself right after I load the sample street, so that I understand what Ghosted does within ten seconds, without reading anything.

L6 starts after the L5 build is checked. Study Dungeon gets the same (its Requirement 25), in its own words and with its own dock.

Terms:

- **The first look** is one run of the existing preview: the preview offset moves from today to +30 days and back to today, driven by the App, with nothing saved (Req 12.5).
- **The flag** is `ghosted:first-look` (`"1"`) in the App's `storage` (the same `FlagStorage` the first-run flags use). It is not in `RESET_KEYS`.
- **The plan** is the pure function that gives the offset for each moment of the first look (design 17.2).

#### Acceptance Criteria

1. WHEN "Load sample street" saves the sample AND the flag is not set, THE first look SHALL be due. It SHALL not be due on a page load with people, after "Back to today", after "Start empty", an add, an import or a restore, or WHEN the flag is set.
2. A due first look SHALL start only WHEN the splash is not shown, no dialog is open and the App is not previewing. WHEN it starts, THE flag SHALL be set first, so a reload never plays it again. WHEN the flag cannot be read, THE first look SHALL be treated as seen; WHEN it cannot be saved, THE first look SHALL not play. Either way the app SHALL keep working.
3. WHILE the user prefers reduced motion, THE first look SHALL not play at all, and the flag SHALL still be set at the moment it would have started.
4. THE plan SHALL move the offset from 0 to exactly +30 days in the first 4 000 ms with an ease-in-out (cubic) curve, rounded to whole hours as the shell's Play rounds, hold at +30 days until 5 000 ms, and then return to 0 (today) at once. The whole first look SHALL last 5 000 ms, the shell's Play time (`TIME_MACHINE_PLAY_MS`).
5. THE first look SHALL move the offset step by step on the dock's own Play (the shell `TimeMachine`'s frames, `frameScheduler` and `frameClock` in tests), with no `setTimeout`, `setInterval` or `requestAnimationFrame` in `src/`. Every write SHALL stay blocked while it plays (Req 12.5), so it saves nothing; the engine's save count SHALL not change.
6. WHILE it plays, THE dock's preview banner SHALL show, as for any preview, and the street SHALL age as it does for the slider (Req 12.2).
7. WHILE it plays, THE dock SHALL show one quiet button, "Skip the preview": a native `<button>` in the Tab order, named by its text, at least 44 × 44 px, with the shared focus outline. It SHALL sit at the top of the dock's own box (where the live-change toast sits, Req 38.4), so it covers neither the dock's controls nor the hero, and it SHALL fit at 320 and 390 px wide with at least 8 px from its neighbours and no horizontal scroll. It SHALL disappear WHEN the first look ends.
8. Skip, Escape, "Back to today", any user change of the slider, a jump, a marker, Play, or a dialog opening SHALL stop the first look at once and return the offset to 0. The touch that stops it SHALL not move the offset itself. WHEN focus was on Skip, it SHALL go to the hero heading (Req 24.3).
9. WHEN it starts, THE App SHALL say once, through the existing polite live region (`#gh-announcer`), "Showing the next 30 days. Nothing is saved." It SHALL say nothing else while it plays, add no live region, and move no focus.
10. THE words SHALL come from `wording.ts` (`firstLookText`) and pass the banned-phrase tests of Requirement 31.2.
11. THE first look SHALL be off unless the App is given `firstLook` (main.tsx gives it), so existing tests that load the sample see no change.
12. THE change SHALL not touch `packages/`, `policy.ts`, `autopsy-sentences.ts`, `clock-guard.ts` or the Claude Code blocks of `dock.css` and `layout.css`, SHALL make no network request, and SHALL leave every existing test unchanged.

## Correctness Properties

Each property is a fast-check test with `{ numRuns: 100 }` or more, fixed timestamps and no real clock. The generators SHALL reach alive, weak and dead people, proved by a generator coverage check (each state at least 10% of generated people, fixed seed).

1. **Health bounds**: for any person and any `now`, `healthAt` is finite and between 0 and 100.
2. **Purity**: the same item and `now` always give the same `healthAt`, `nextDueAt`, `applyEvent` and `resurrect` results.
3. **Never brighter with time**: for any person and t1 ≤ t2 with no contact between, `healthAt(t2) ≤ healthAt(t1)`.
4. **Future last contact**: for any `lastContactAt` later than `now`, `healthAt` is exactly 100.
5. **Settle-safe**: changing `item.lastEventAt` or `item.health` never changes `healthAt`.
6. **Text adds 40 up to 100**: for any person not dead, a text gives `min(100, h + 40)`, and `healthAt` at `now` matches it within 1e-9.
7. **Call and meet-up light fully**: for any person not dead, a call or meet-up gives 100.
8. **Next due**: for any alive person, `nextDueAt` is `policyData.lastContactAt + 2 × T / 5` (a whole number of milliseconds, which keeps the day-36 boundary exact), `healthAt` at that time is 60 within 1e-9 and drops below 60 one minute later; for any weak person `nextDueAt` is `now`; for any dead person it is `null`.
9. **Reconnect always works**: for any dead person and any contact kind, `resurrect` returns `ok: true` and the person is alive with health 100 afterwards.
10. **Light follows freshness**: for any person, the window's `--lit` equals `health / 100`.
11. **State in three ways**: for any person, the rendered window and card show the glyph and the word that match its state.
12. **Preview never writes**: for any time-machine offset above 0, no write action reaches the engine and stored data stays byte-for-byte the same.
13. **Started dark**: for any rhythm and any last contact more than `9 × T / 10` before the add time, the person is dead at creation with "created" and "died" at the same timestamp, and the autopsy sentences name the whole-day gap from `payload.lastContactAt` to `diedAt` (at least 1 day) and never contain "0 days".
14. **Loss line matches the engine's states** (Requirement 35): for any person and `realNow`, the person counts as going dark exactly when the engine shows them not dark at `realNow` and dark at `realNow + 7 days`. A person counted as starting to flicker is lit at `realNow`, not dark at `realNow + 7 days`, and no longer lit (flickering, or dark) one minute after `realNow + 7 days`. A lit person who is not counted at all is still lit at `realNow + 7 days`.
15. **The saves line never over-claims** (Requirement 36): for any generated people, `now` and budget, every pick counted by the line is dark at `now + 7 days` if left alone, and after a call at `now` through the real engine (and, in a separate run, a meet-up) it is not dark at `now + 7 days`, so not at any time in the next 7 days. Every at-risk pick that is not counted is dark at `now + 7 days` even after a call. The count is never more than the number of picks.
16. **The rescue line is a real gain** (Requirement 37): for any generated dark person with a `wentWeakAt` and no rhythm edit, the what-if of one call at `wentWeakAt` returns `ok: true` with `stoppedAt` `null`, its `baselineDiesAt` is within P of the real `diedAt`, its `diesAt` is later than the real `diedAt`, and the sentence is shown with N equal to `floor((diesAt − baselineDiesAt + P) / DAY_MS)`. For any dark person whose `wentWeakAt` is `null`, no sentence is shown.
17. **diffStates reports exactly the changes** (Requirement 38): for any two lists of ids and states, `diffStates` returns exactly the items present in both whose state differs, once each, in the order of the second list, and a list compared with itself gives no change.

## Authorship

- **Written by Claude Code at the developer's request, outside Kiro** (Kiro never writes or edits it):
  - `apps/ghosted/src/autopsy-sentences.ts`: the cause-of-death sentences in Requirement 19.3.
- **Written by Kiro as a documented exception** (the rules are set by the developer in Requirements 1 to 4):
  - `apps/ghosted/src/policy.ts`: the decay rules in Requirements 1 to 4, and the type changes in the Type Contract.
- **Kiro** writes everything else in this spec, including the policy and autopsy-sentence tests, the UI, the shell additions in Requirements 26 to 28, and the app setup in Requirement 32: `apps/ghosted/index.html`, `vite.config.ts`, `src/main.tsx`, the `package.json` scripts, the Ghosted steps in `scripts/check.sh`, and the README update.

## Out of Scope

- Sound effects (the wireframe's "Walk in with sound").
- A failing reconnect or "No reply yet" (it needs a new event kind).
- Changing a person's last contact date after adding them, except by logging a contact.
