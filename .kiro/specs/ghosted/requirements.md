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
2. WHEN the panel renders, THE app SHALL explain the rule in three short steps: only fading windows are considered; the dimmer and more important the person, the more reaching out is worth; the picks give the most worth per minute that fits the time.
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

1. THE shell `AutopsyDialog` SHALL accept an optional marker renderer that draws each tend marker and its legend entry from app data.
2. WHERE no renderer is given, THE `AutopsyDialog` SHALL behave exactly as today: right and wrong marks, the same legend and the same accessible chart summary.
3. WHERE a renderer is given, THE chart's accessible summary SHALL describe the markers in the app's words (for example "3 calls, 2 messages, 1 meet-up") instead of right and wrong counts.
4. A new shell test SHALL prove text, call and meet-up markers render with their legend, and the existing shell tests and Study Dungeon tests SHALL pass without modification.
5. THE shell AutopsyDialog SHALL accept an optional prop that moves focus to the dialog's content when it opens; WHERE it is not given, THE dialog SHALL behave exactly as today. A new shell test SHALL prove both.

### Requirement 29: Engine Unchanged

**User Story:** As the developer, I want proof that Ghosted needed no engine change, so that the core promise holds.

#### Acceptance Criteria

1. THE Ghosted work SHALL make zero changes under `packages/engine/`.
2. A check SHALL record the commit at which this spec is approved and run `git diff --exit-code <that commit> -- packages/engine` and `git status --porcelain -- packages/engine`, failing if either reports a change.
3. WHERE Ghosted seems to need an engine change, THE work SHALL stop and the need SHALL be reported (`engine-boundary.md`).
4. CHANGES under `packages/shell/` SHALL be limited to Requirements 26 to 28. Requirement 32 needs no shell change; WHERE it turns out to need one, THE work SHALL stop and report it rather than widen this list.

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

## Authorship

- **Hand-written by the developer** (Kiro never writes or edits it):
  - `apps/ghosted/src/autopsy-sentences.ts`: the cause-of-death sentences in Requirement 19.3.
- **Written by Kiro as a documented exception** (the rules are set by the developer in Requirements 1 to 4):
  - `apps/ghosted/src/policy.ts`: the decay rules in Requirements 1 to 4, and the type changes in the Type Contract.
- **Kiro** writes everything else in this spec, including the policy and autopsy-sentence tests, the UI, the shell additions in Requirements 26 to 28, and the app setup in Requirement 32: `apps/ghosted/index.html`, `vite.config.ts`, `src/main.tsx`, the `package.json` scripts, the Ghosted steps in `scripts/check.sh`, and the README update.

## Out of Scope

- Sound effects (the wireframe's "Walk in with sound").
- A failing reconnect or "No reply yet" (it needs a new event kind).
- Changing a person's last contact date after adding them, except by logging a contact.
