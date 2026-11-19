# Technical Design: Study Dungeon

## Overview

Study Dungeon is a spaced-repetition study app built on the Decay Engine. Facts decay exponentially based on their half-life; correct answers double the half-life and restore full health, wrong answers halve it and drop health to 45. The app provides a dark dungeon-themed UI with three lists (Crypt, Dungeon, Graveyard), fight interactions, triage, autopsy, and time machine preview.

**Key Design Decisions:**
- **Policy-driven decay**: All decay logic lives in `StudyDungeonPolicy`, which implements exponential decay with half-life doubling/halving
- **Shared shell components**: Reusable UI components (counters, item cards, history, autopsy, triage, time machine) live in `packages/shell` and accept theme + wording props
- **Time machine via `now` parameter**: A single reactive `now` variable controls all engine reads; write operations blocked while previewing
- **Cause-of-death is hand-written**: Autopsy sentences are crafted by the developer, not generated, to ensure narrative quality
- **Sample data via event replay**: Sample facts created by replaying dated events through the engine to achieve realistic states

## Architecture

### Package Structure

```
apps/study-dungeon/
├── src/
│   ├── policy.ts                    # StudyDungeonPolicy implementation (HAND-WRITTEN)
│   ├── policy.test.ts               # Policy unit tests + outcome scenarios
│   ├── autopsy-sentences.ts         # Cause-of-death text generation (HAND-WRITTEN)
│   ├── autopsy-sentences.test.ts    # Tests for autopsy narrative
│   ├── sample-data.ts               # Sample data generator via event replay
│   ├── sample-data.test.ts          # Validation that sample data loads correctly
│   ├── theme.ts                     # Color palette, fonts, CSS variables
│   ├── wording.ts                   # List names, button labels, state names, every line of app text
│   ├── engine-instance.ts           # createEngine(): the engine on LocalStorageAdapter("study-dungeon")
│   ├── first-run.ts                 # First-run and tour flags, RESET_KEYS, resetAllData
│   ├── storage-errors.ts            # classifyWriteError / classifyLoadError / createEngineSafely
│   ├── write-guard.ts               # runWrite / reportWriteError: storage problems shown, bugs rethrown
│   ├── sound.ts                     # Generated sound effects, off by default
│   ├── App.tsx                      # The app: state, writes, dialogs, layout
│   ├── Root.tsx                     # createEngineSafely + ErrorBoundary around App
│   ├── components/
│   │   ├── HeroSection.tsx          # Stats and primary CTA
│   │   ├── ThreeLists.tsx           # Crypt/Dungeon/Graveyard switcher
│   │   ├── FightDialog.tsx          # Review interaction for alive/weak facts
│   │   ├── ChallengeDialog.tsx      # Resurrection interaction for dead facts
│   │   ├── AddEditFactDialog.tsx    # Add/edit fact form
│   │   ├── FirstRun.tsx             # Load sample data or start empty
│   │   ├── Tour.tsx                 # The four-step first-run tour
│   │   ├── SoundToggle.tsx          # The sound switch beside "Reset all data"
│   │   ├── ResetData.tsx            # "Reset all data" with confirmation
│   │   ├── ErrorBoundary.tsx        # ErrorBoundary and ProblemScreen
│   │   └── useModalDialog.ts        # Opens a modal <dialog>; gives focus back to its opener
│   ├── styles/                      # global, app, dialogs, lists, hero, problem, animations, tour, layout
│   ├── main.tsx                     # Renders Root
│   └── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts

packages/shell/
├── src/
│   ├── components/
│   │   ├── Counters.tsx             # Three-badge counter display
│   │   ├── ItemCard.tsx             # Card for single item in list
│   │   ├── HistoryLogViewer.tsx     # Chronological history display
│   │   ├── AutopsyDialog.tsx        # Autopsy report with health chart
│   │   ├── TriagePanel.tsx          # Budget input + picks/others display
│   │   ├── TimeMachine.tsx          # Slider + quick-jump buttons + play
│   │   └── PreviewBanner.tsx        # "Future preview · nothing is saved" + Back to today
│   ├── types.ts                     # Theme, Wording, and component prop types
│   └── index.ts
└── package.json
```

### Component Responsibilities

**Shell Components** (`packages/shell`):
- Accept `theme` (colors, fonts, CSS variables) and `wording` (list names, button labels, state names) as props
- Render structure and layout, delegate styling to theme
- Call engine methods via props (e.g., `onTend`, `onResurrect`) — never import engine directly
- Built only for Study Dungeon's needs now; extended when Ghosted/Expiry Reaper require new features

**App Components** (`apps/study-dungeon`):
- Create and own the single `DecayEngine` instance with `StudyDungeonPolicy` and `LocalStorageAdapter`
- Manage `realNow` (the clock, refreshed every minute) and `previewOffsetMs` (0 = today); `now = realNow + previewOffsetMs`
- Provide theme and wording to shell components
- Implement app-specific dialogs (Fight, Challenge, Add/Edit Fact)
- Disable write operations while previewing (`previewOffsetMs > 0`). Never compare `now` with `Date.now()`: the clock moves every millisecond, so that test is almost always true

## Components and Interfaces

### Core Interfaces

```typescript
// DecayEngine is imported from @decay-engine/engine
import { DecayEngine, DecayPolicy, Item, StorageAdapter } from '@decay-engine/engine'

// App-specific policy type
type StudyDungeonPolicy = DecayPolicy<FactPayload, FactPolicyData, ReviewEvent>

// Shell component props
// The shell has a fixed set of colour and font roles. Every app fills them in
// from its own palette; shell components never use an app's colour names.
interface ThemeProps {
  colors: {
    bg: string; panel: string; panelHi: string; line: string
    text: string; textDim: string; accent: string
    alive: string; weak: string; dead: string
  }
  fonts: { display: string; body: string; mono: string }
}

interface WordingProps {
  lists: { alive: string; weak: string; dead: string }
  actions: { tend: string; resurrect: string; edit: string; remove: string; autopsy: string }
  states: { alive: string; weak: string; dead: string }
  timeMachine: {
    title: string; slider: string
    showing: (date: string, days: number) => string  // date formatted by the app; whole days ahead
    jump: (days: number) => string                   // "+7 days"
    play: string; stop: string
  }
  preview: { banner: string; backToToday: string }   // "Future preview · nothing is saved"
  triage: {
    title: string; budget: string
    minutes: (minutes: number) => string             // budget choice, "10 min"
    custom: string; customLabel: string
    invalidBudget: (max: number) => string
    run: string; picks: string; others: string
    empty: string                                    // no weak items
    nothingFits: string                              // weak items exist, none fits the budget
    valuePerMinute: (value: number) => string
    cost: (minutes: number) => string
    diesIn: (days: number) => string                 // whole days, rounded up
    diesNever: string                                // diesAt null: not within 10 years
    startSession: string
  }
  autopsy: {
    title: string; epitaph: string; chartTitle: string
    chartLabel: (summary: AutopsyChartSummary) => string  // the chart's aria-label, in words
    weakBand: (threshold: number) => string               // legend: "Weak below 60"
    deadBand: (threshold: number) => string               // legend: "Dead below 10"
    markRight: string; markWrong: string                  // legend: "Knew it" (circle), "Forgot" (cross)
    cause: string; close: string
  }
}

// What the chart's aria-label is built from. Dates are formatted by the app.
interface AutopsyChartSummary {
  from: string; to: string           // first and last point (the death)
  startHealth: number; endHealth: number
  right: number; wrong: number       // tend marks within the chart's span
}

// One icon per state, supplied by the app (inline SVG using currentColor).
// Always shown beside the state's words, never colour alone.
type StateIcons = Record<"alive" | "weak" | "dead", ReactNode>

interface CountersProps {
  alive: number
  weak: number
  dead: number
  theme: ThemeProps
  wording: WordingProps
  icons: StateIcons
}

interface ItemCardProps<Payload, PolicyData> {
  item: Item<Payload, PolicyData>
  state: "alive" | "weak" | "dead"
  theme: ThemeProps
  wording: WordingProps
  icons: StateIcons
  renderText: (item: Item<Payload, PolicyData>) => ReactNode    // the item's text
  renderDetail?: (item: Item<Payload, PolicyData>) => ReactNode // wake-up time, health, epitaph
  onAction?: () => void   // button label: wording.actions.tend, or .resurrect when dead
  onAutopsy?: () => void  // button label: wording.actions.autopsy; read-only, never disabled
  onEdit?: () => void     // button label: wording.actions.edit; the app opens its form
  onRemove?: () => void   // button label: wording.actions.remove; the app confirms
  disabled?: boolean      // every write button (action, edit, remove) aria-disabled and ignoring clicks; still visible and focusable
  disabledReason?: string // the buttons' title and part of their description while disabled
}
// Buttons appear in this order: action, autopsy, edit, remove.

interface HistoryLogViewerProps {
  entries: HistoryEntry[]
  theme: ThemeProps
  describe: (entry: HistoryEntry) => string   // e.g. "Fought: knew it"; from the app
  formatTimestamp: (ms: number) => string
}

// Budgets: 5, 10 (chosen first), 20, or a custom whole number from 1 to
// maxBudgetMinutes. An invalid custom budget shows wording.triage.invalidBudget
// and calls nothing. The result is worked out again when `triage` changes.
interface TriagePanelProps<Payload, PolicyData> {
  theme: ThemeProps
  wording: WordingProps
  triage: (budgetMinutes: number) => TriageResult<Payload, PolicyData>  // app: engine.triage(budget, now)
  now: number                     // turns diesAt into whole days (rounded up)
  maxBudgetMinutes: number        // Study Dungeon passes 1440, engine.triage's limit
  renderText: (item: Item<Payload, PolicyData>) => ReactNode
  onStartSession: (picks: TriageCandidate<Payload, PolicyData>[]) => void
  startDisabled?: boolean         // while previewing: aria-disabled, ignores clicks
  startDisabledReason?: string
}

// A native modal <dialog>; Escape closes it. Read-only: only the optional
// resurrect button writes, through the app. The chart is inline SVG: the
// health line, shaded bands below thresholds.weak and thresholds.dead, and a
// mark per tend (circle = right, cross = wrong) with a legend in words.
// The app builds the points (see Autopsy Dialog below); the shell never
// reads a report or a payload.
interface AutopsyDialogProps {
  theme: ThemeProps
  wording: WordingProps
  icons: StateIcons                         // icons.dead beside the title
  epitaph?: string                          // not shown when missing or blank
  causeSentences: readonly string[]         // from autopsy-sentences.ts, one paragraph each, in order
  points: readonly { at: number; health: number }[]   // oldest first; two points at one time draw a tend's jump
  tends: readonly { at: number; correct: boolean }[]  // only those within the points' span are drawn
  thresholds: { weak: number; dead: number }
  formatDate: (ms: number) => string        // axis dates and the summary
  onClose: () => void
  onResurrect?: () => void                  // button label: wording.actions.resurrect
  resurrectDisabled?: boolean               // while previewing: aria-disabled, ignores clicks
  resurrectDisabledReason?: string
}

// Slider from 0 to 60 days in one-hour steps, quick jumps +7/+14/+30 (always
// available), Play from the current offset to +60 days over 5 seconds (again
// from today when already at +60; pressing it again stops). Moving the slider
// or jumping stops Play. With reduced motion, Play jumps straight to +60 days.
interface TimeMachineProps {
  today: number                          // realNow
  offsetMs: number                       // previewOffsetMs, controlled by the app
  onChange: (offsetMs: number) => void   // 0 to 60 days
  formatDate: (ms: number) => string     // formats today + offsetMs
  theme: ThemeProps
  wording: WordingProps
  frames?: FrameScheduler                // default requestAnimationFrame; tests drive frames by hand
  clock?: () => number                   // default performance.now
  prefersReducedMotion?: () => boolean   // default the media query, read on each Play
}

interface FrameScheduler {
  request(callback: () => void): unknown
  cancel(handle: unknown): void
}

// Rendered by the app only while previewing. "Back to today" sets the offset to 0.
interface PreviewBannerProps {
  theme: ThemeProps
  wording: WordingProps
  onBackToToday: () => void
}
```

### Component Hierarchy

```
App
├── HeroSection
│   └── Counters (from shell)
├── ThreeLists
│   ├── Crypt (alive)
│   │   └── ItemCard[] (from shell)
│   ├── Dungeon (weak)
│   │   └── ItemCard[] (from shell)
│   └── Graveyard (dead)
│       └── ItemCard[] (from shell)
├── FightDialog
├── ChallengeDialog
├── AddEditFactDialog
├── PreviewBanner (from shell, only while previewing)
├── TriagePanel (from shell)
├── AutopsyDialog (from shell)
├── TimeMachine (from shell)
├── FactAutopsy → AutopsyDialog (from shell)
├── ResetData
└── FirstRun (shown instead of everything above on first run)
```

As built in round 7 (tasks 11.5, 16, 17, 18, 20), with landmarks and the
two-column layout:

```
Root
└── ErrorBoundary                    (crash → ProblemScreen)
    ├── ProblemScreen                (snapshot could not be loaded, or no storage)
    └── App
        ├── PreviewBanner (from shell, only while previewing)
        ├── <header>                 h1 and tagline
        └── <main>
            ├── live region          polite: changes and storage problems
            ├── FirstRun             (first run only, instead of everything below)
            ├── HeroSection → Counters (from shell)
            ├── .sd-layout
            │   ├── main column: Add fact, session message,
            │   │   ThreeLists (<nav> around the tabs; ItemCard[] from shell)
            │   └── side column: TimeMachine, TriagePanel (from shell)
            ├── ResetData            with SoundToggle beside it
            ├── Tour                 (right after first run, once)
            └── one dialog at a time: AddEditFactDialog, FightDialog,
                ChallengeDialog, FactAutopsy → AutopsyDialog (from shell)
```

### Round 7 interfaces

```typescript
// Root.tsx: what main.tsx renders. createEngine is called once, through
// createEngineSafely; a storage problem shows ProblemScreen with
// storageProblemText[problem] ("corrupt" also offers Reset all data).
interface RootProps {
  createEngine: () => StudyDungeonEngine     // engine-instance.ts; no engine is built at import
  storage: FlagStorage | null                // null when localStorage cannot be reached
  reload?: () => void                        // default location.reload
  log?: (error: unknown, info: ErrorInfo) => void   // ErrorBoundary; default console.error
  appProps?: Omit<AppProps, "engine" | "storage" | "reload">
}

// AppProps gains one optional prop (the rest are unchanged):
//   createAudioContext?: () => AudioContextLike | null   // default the browser's AudioContext

// FightDialog, ChallengeDialog and AddEditFactDialog gain optional props:
//   sound?: SoundPlayer                        // Fight and Challenge: the App's one player
//   onResult?: (result) => void                // Fight: "correct" | "incorrect" | "died";
//                                              // Challenge: { ok: true; halfLifeDays } | { ok: false; reason }
//   onWriteError?: (error: unknown) => boolean // true when the App handled a storage problem
// Sounds: Fight right → "right", wrong → "wrong"; Challenge won → "revive",
// lost → "wrong". Nothing on Walk away, a failed save, or a death before the answer.

// write-guard.ts
function reportWriteError(error: unknown, onProblem: (p: WriteProblem) => void): boolean
function runWrite(write: () => void, onProblem: (p: WriteProblem) => void): boolean  // rethrows non-storage errors

// first-run.ts
const TOUR_DONE_FLAG = "study-dungeon:tour-done"
const RESET_KEYS = [ENGINE_STORAGE_KEY, STARTED_FLAG, TOUR_DONE_FLAG]  // the sound setting is kept

interface TourProps { onDone: () => void }                   // finished or skipped
interface SoundToggleProps { enabled: boolean; onChange: (enabled: boolean) => void }
interface ResetDataProps { onConfirm: () => void; disabledReason?: string; children?: ReactNode }
```

## Data Models

### Type Contract

```typescript
// Policy types
type FactPayload = {
  question: string              // max 140 chars, required
  answer: string                // max 140 chars, required
  why: string                   // max 80 chars, optional epitaph
  knowledge: "new" | "shaky" | "solid"  // initial knowledge level
}

type FactPolicyData = {
  halfLifeDays: number          // 1..180, current half-life in days
}

type ReviewEvent = {
  kind: "review"
  correct: boolean
}

// StudyDungeonPolicy implements DecayPolicy<FactPayload, FactPolicyData, ReviewEvent>
```

### Policy Implementation

**Thresholds**: `{ weak: 60, dead: 10 }`

**init(payload, now)**:
- Returns `{ halfLifeDays: 2 }` for "new", `5` for "shaky", `10` for "solid"

**healthAt(item, now)**:
- Returns `item.health × 0.5^((now - item.lastEventAt) / (halfLifeDays × 86400000))`
- Exponential decay: health halves every half-life period

**applyEvent(item, event, now)**:
- `event.correct === true`: returns `{ health: 100, policyData: { halfLifeDays: Math.min(item.policyData.halfLifeDays × 2, 180) } }`
- `event.correct === false`: returns `{ health: 45, policyData: { halfLifeDays: Math.max(item.policyData.halfLifeDays / 2, 1) } }`

**nextDueAt(item, now)**:
- If dead: returns `null`
- If health < 60 at now: returns `now`
- Otherwise: returns `item.lastEventAt + (halfLifeDays × 86400000 × log2(item.health / 60))`

**resurrect(item, event, now)**:
- `event.correct === true`: returns `{ ok: true }` with no policyData. Nothing changes policyData after death, so it still holds the half-life the fact had when it died, and the engine keeps it. (The policy cannot read history; it only receives the item, the event and `now`.)
- `event.correct === false`: returns `{ ok: false, reason: "You got it wrong. The fact stays dead." }`

### Theme Configuration

```typescript
// theme.ts
export const studyDungeonTheme = {
  colors: {
    bg: "#060509",
    stone: "#110d17",
    stoneHi: "#1c1625",
    line: "#2b2235",
    bone: "#f0e6cc",
    boneDim: "#b0a694",
    ecto: "#9cf26b",
    pumpkin: "#ff8a2b",
    blood: "#ff5f77",
    moon: "#a8e6d6",
    slate: "#a9bde0"
  },
  fonts: {
    display: "'Pirata One', cursive",
    body: "'Spectral', serif",
    mono: "'IBM Plex Mono', monospace"
  }
}

// What shell components see: the palette mapped onto the shell's roles.
export const studyDungeonShellTheme: ThemeProps = {
  colors: {
    bg: "#060509",       // bg
    panel: "#110d17",    // stone
    panelHi: "#1c1625",  // stoneHi
    line: "#2b2235",     // line
    text: "#f0e6cc",     // bone
    textDim: "#b0a694",  // boneDim
    accent: "#ff8a2b",   // pumpkin
    alive: "#9cf26b",    // ecto
    weak: "#ff8a2b",     // pumpkin
    dead: "#a9bde0"      // slate
  },
  fonts: { display: "'Pirata One', cursive", body: "'Spectral', serif", mono: "'IBM Plex Mono', monospace" }
}

// wording.ts
export const wording = {
  lists: {
    alive: "Crypt",
    weak: "Dungeon",
    dead: "Graveyard"
  },
  actions: {
    tend: "Fight",
    resurrect: "Challenge",
    edit: "Edit",
    remove: "Remove"
  },
  states: {
    alive: "sleeping",
    weak: "monster",
    dead: "dead"
  }
}
```

## State Flow

### Application Lifecycle

1. **App Load**:
   - Create `DecayEngine` with `StudyDungeonPolicy` and `LocalStorageAdapter("study-dungeon")`
   - Initialize reactive `now` to `Date.now()`
   - If no stored data, show first-run dialog

2. **Settling**: on load, and every minute while not previewing, call `engine.tick(realNow)`. This saves deaths and weak crossings (with their bisected times) so history and Autopsy are complete. Never tick while previewing.

3. **Normal Mode** (`previewOffsetMs === 0`):
   - All screens read: `engine.view(now)`, `engine.due(now)`, `engine.triage(budget, now)`, `engine.autopsy(id, now)`
   - Write operations enabled: `addItem`, `tend`, `edit`, `remove`, `resurrect`
   - Each write uses `Date.now()` as the timestamp (the app may read the clock; only the engine may not)

4. **Time Machine Mode** (`previewOffsetMs > 0`):
   - User moves slider → updates `now` → all screens re-render with `engine.view(now)` etc.
   - Write operations disabled (buttons grayed, forms hidden)
   - Banner shows "Future preview · nothing is saved"
   - "Back to today" sets `previewOffsetMs` to 0

### Data Flow Diagram

```
User Action → App Component → DecayEngine Method → Storage Adapter → localStorage
                    ↓                  ↓
              Shell Component    In-Memory State
                    ↓                  ↓
              Themed UI ← engine.view(now) / due(now) / etc.
```

## Screen-by-Screen Engine Usage

### Hero Section and Stats

**Reads**:
- `engine.view(now)` for alive/weak/dead counts
- `engine.history(id)` for each item (history is per item) for souls banished (count `tended` entries with `event.correct === true`) and streak calculation

**Rendering**:
- Eyebrow: "Your memory today"
- If weak facts exist: "N facts are weakening" ("1 fact is weakening") + button "Fight the weakest" → opens FightDialog with the lowest-health weak fact. Disabled while previewing, with the reason
- If no weak but alive exist: "All quiet in the Crypt. Every fact is sleeping soundly."
- If there are no facts: "No facts yet. Use Add fact to put your first one in the Crypt."
- If only dead facts: "Nothing is weakening. Your graves are waiting in the Graveyard."
- Stats: the shell's `Counters` for alive, weak and dead (icon, number in IBM Plex Mono, list name), then souls banished and the streak (icon, number, label), from `stats.ts`
- Counts read `engine.view(now)`, so they follow the time machine. Souls and the streak are about the past, so they read `realNow`
- The App's optional `timeZone` prop sets the streak's calendar days (tests pass "UTC")

### Three Lists (Crypt, Dungeon, Graveyard)

**Reads**:
- `engine.view(now)` to get all items

**Filtering**:
- **Crypt** (alive): shows facts with wake-up time (`policy.nextDueAt(item, now)` formatted as date)
- **Dungeon** (weak): shows facts as monsters with current health, sorted by health ascending (weakest first)
- **Graveyard** (dead): shows tombstones with epitaph (`payload.why`) if present

**Rendering**:
- Each list uses `ItemCard` from shell with theme and wording
- Counter badges show totals per state

### Add/Edit Fact Dialog

**Form Fields**:
- Question (max 140 chars, required)
- Answer (max 140 chars, required)
- Why it matters (max 80 chars, optional) → stored as `payload.why`
- How well do you know it: Brand New / Shaky / Solid → `payload.knowledge`
- Importance: 1, 2, or 3
- Review cost: 1, 2, 3, or 5 minutes

**Writes**:
- Add: `engine.addItem({ payload: { question, answer, why, knowledge }, importance, costMinutes }, Date.now())`
- Edit: `engine.edit(id, { payload?: { question, answer, why, knowledge }, importance?, costMinutes? }, Date.now())`. The knowledge field is not shown when editing; the stored value is passed through unchanged

### Fight Dialog (Alive/Weak Facts)

**Flow**:
1. Show question + "Show answer" button + "Walk away" button
2. User clicks "Show answer" → reveal answer + show "I knew it" / "I forgot" buttons
3. User clicks "I knew it" → `engine.tend(id, { kind: "review", correct: true }, Date.now())`
4. User clicks "I forgot" → `engine.tend(id, { kind: "review", correct: false }, Date.now())`
5. User clicks "Walk away" (any time) → dismiss dialog, no engine call

**Result**:
- On correct: health → 100, half-life doubled
- On incorrect: health → 45, half-life halved

### Challenge Dialog (Dead Facts)

**Flow**:
1. Show question + answer (no hide) + "I knew it" / "I forgot" buttons
2. User clicks "I knew it" → `engine.resurrect(id, { kind: "review", correct: true }, Date.now())`
3. User clicks "I forgot" → `engine.resurrect(id, { kind: "review", correct: false }, Date.now())`

**Result**:
- On success: show "Resurrected! New half-life: X days"
- On failure: show "You got it wrong. The fact stays dead."

### Triage Panel

**Input**:
- Budget options: 5, 10, 20, or custom minutes

**Reads**:
- `engine.triage(budgetMinutes, now)` → returns `{ picks, others }`

**Rendering**:
- **Picks**: question, value per minute, cost, days until death
- **Others**: question, "dies in N days"
- "Start the session" button → queues fights for all picks in order
- No weak facts: an empty state instead of the lists
- Triage reads `now`, so it also runs while previewing; "Start the session" is disabled then

**Fight queue** (in `App.tsx`):
- The queue holds the pick ids in triage order. Each fact is looked up again with `engine.view(Date.now())` when its fight opens; one that has died or been removed since triage is skipped and named in the completion message
- Closing a fight (Close, Walk away or Escape) opens the next one; each fight shows "Fight N of M" and a "Stop session" button that drops the rest of the queue
- When the queue is empty: "Session complete.", plus one line per skipped fact

**Algorithm**:
- Engine computes value = `(100 - health) × (1 - health / 100) × importance`
- Engine uses 0/1 knapsack to maximize total value within budget

### Autopsy Dialog

**Reads**:
- `engine.autopsy(id, now)` → returns `AutopsyReport`

**Rendering** (uses `AutopsyDialog` from shell + `autopsy-sentences.ts`):
- Epitaph (`payload.why`) if present
- Health-over-time chart from creation/last resurrection to death
- Cause-of-death sentences (HAND-WRITTEN in `autopsy-sentences.ts`):
  - "Went weak on [date]" if `wentWeakAt`
  - "Last reviewed on [date]" if `lastTend`
  - "You were silent for [N days]" using `silenceMs`
  - "You missed X reviews" counting `tends` with `correct: false`
  - Half-life history worked out by replaying tend events from initial half-life

**Developer Responsibility**:
- `autopsy-sentences.ts` is HAND-WRITTEN to craft narrative quality
- Engine provides facts, developer writes sentences

**Opening it**: graves get an Autopsy button (`ItemCard.onAutopsy`). It is read-only, so it works while previewing, including for a fact that is dead only on the previewed day (`engine.autopsy(id, now)` settles in memory). The dialog's Challenge button closes it and opens the ChallengeDialog; it is disabled while previewing, with the reason.

**Chart points** (`src/autopsy-chart.ts`, pure): the report alone does not carry the half-life a resurrected fact's current life started with, so the whole history from `engine.history(id)` is replayed:
- `created`: health from the entry, half-life from `studyDungeonPolicy.init` (the knowledge level)
- `tended`: through `studyDungeonPolicy.applyEvent`
- `resurrected`: health 100, half-life kept
- other entries do not change the curve
Health is then sampled with `studyDungeonPolicy.healthAt` over the current life only (`report.lifeStartedAt` to `report.diedAt`): 48 equal steps by default, plus the health just before and just after each review in that life.

**Sentences**: `generateCauseSentences(report, payload, { halfLifeAtDeath: item.policyData.halfLifeDays })`, with the dead item read from `engine.view(now)`.

### Time Machine

**UI Elements** (uses `TimeMachine` and `PreviewBanner` from shell):
- Slider: today to +60 days
- Quick-jump buttons: +7, +14, +30 days
- Play button: animates from the current offset to +60 days over 5 seconds; pressing it again stops. With `prefers-reduced-motion` it jumps straight to +60 days
- "Back to today" button, in the banner

**State Management**:
- Moving slider updates `previewOffsetMs` → all screens re-render with `engine.view(now)` etc.
- Banner: "Future preview · nothing is saved", shown only while previewing
- Write operations disabled while `previewOffsetMs > 0`: Add fact, Edit, Remove, Fight, Challenge and "Start the session" stay visible, marked `aria-disabled`, with the reason as their title. Writes still use `Date.now()`
- No settle ticks while previewing. "Back to today" sets the offset to 0, which ticks straight away and refreshes `realNow`

### First Run

**Triggers**:
- Shown when a separate flag `study-dungeon:started` is missing from localStorage. (Checking for zero items would show first run again forever after "Start empty".) Both buttons set the flag; "Reset all data" clears it

**Options**:
1. **Load sample data**: calls `loadSampleData(engine)` which replays 12 facts with dated events
2. **Start empty**: initializes with empty storage

**Sample Data Construction** (in `sample-data.ts`):
- Creates 12 facts covering "new", "shaky", "solid" knowledge levels
- Replays events at past timestamps: `addItem(payload, pastTime)`, `tend(id, event, pastTime)`
- Calls `engine.tick(Date.now())` to settle all items at current time
- Results in facts distributed across alive, weak, and dead states

**As built** (`src/first-run.ts`, `components/FirstRun.tsx`):
- The flag is read and written through a storage object the App receives (`storage` prop, default `window.localStorage`), so tests use an in-memory fake
- First run shows only when the flag is missing **and** the engine has no facts. Facts with a missing flag are data from before the flag existed: the App sets the flag and skips first run, so sample facts never land on real ones
- "Load sample data" calls `loadSampleData(engine, clock())` (the real time) and bumps the version. "Start empty" goes to the main screen, where the empty lists ask for the first fact. Both set the flag

**Tour** (task 11.5, `components/Tour.tsx`):
- Four steps, in order: the Crypt, the Dungeon, Fight, the time machine. Each step outlines its part of the page (`data-tour-active` on the Crypt tab, the Dungeon tab, "Fight the weakest" or else the first Fight on a card, and the time machine); with no facts the Fight step is words only
- Starts right after either first-run button, unless `study-dungeon:tour-done` is already in the App's `storage`. Never shown on a normal visit
- A small panel in the corner (`<aside aria-label="Tour">`), not a modal. Focus starts on Next; Back, Next and "Skip tour" are buttons; Escape skips. Finishing or skipping saves the flag and moves focus to `<main>`
- Scrolling to a step's target is instant: nothing moves on its own

### Reset All Data

- "Reset all data" asks "Reset all data? This cannot be undone." (Cancel first; Escape cancels)
- Confirming removes exactly `decay-engine:study-dungeon`, `study-dungeon:started` and `study-dungeon:tour-done` (`RESET_KEYS` in `first-run.ts`), then calls the App's `reload` prop (default `window.location.reload`), which shows first run and the tour again. The sound setting (`study-dungeon:sound`) is a preference for this browser and is kept
- The same reset is offered on the problem screen for a snapshot that cannot be read, and on the crash screen

### Sound (task 20, Requirement 18)

- A switch, "Sound effects", in the settings area beside "Reset all data". Off by default; `loadSoundEnabled(storage)` at mount, `saveSoundEnabled(storage, enabled)` on every change. It is a preference, so it also works while previewing
- The App makes one `createSoundPlayer({ isEnabled })`, which reads the switch on every play, and passes it to FightDialog and ChallengeDialog
- Fight: right → "right", wrong → "wrong". Challenge: won → "revive", lost → "wrong". Walk away, a failed save, or a fact that died before the answer play nothing
- Disabled while previewing, with the reason

### Remove Fact

**Flow**:
1. User clicks "Remove" on fact
2. App shows confirmation dialog: "Remove this fact? This cannot be undone."
3. User confirms → `engine.remove(id)` (remove takes no time argument)
4. User cancels → dismiss dialog

## Error Handling

### Policy Errors
- Invalid half-life bounds (< 1 or > 180): clamped in `applyEvent`
- Resurrection with wrong answer: returns `{ ok: false, reason: "..." }`

### App Validation
- Question/answer max 140 chars: validated in form before calling `addItem`/`edit`
- Why max 80 chars: validated in form
- Importance 1-3, cost 1/2/3/5: enforced by dropdown/radio inputs

### Storage Errors
- `LocalStorageAdapter` throws on quota exceeded: app catches and shows "Storage full" error
- Failed save leaves storage and memory unchanged (engine guarantee)

**As built** (task 18.3):
- **At startup** (`Root.tsx`): `createEngineSafely(createEngine)`. "corrupt" (the snapshot cannot be read) shows `ProblemScreen` with `storageProblemText.corrupt`, Reload and Reset all data (`RESET_KEYS`, then reload). "unavailable" shows its sentence and Reload only. Errors that are not storage problems reach the ErrorBoundary. No engine is built at import any more, so a bad snapshot never leaves a blank page
- **Crashes while rendering**: `ErrorBoundary` around the App logs the error and shows the crash screen, with Reload and Reset all data
- **During writes** (`write-guard.ts`): addItem, edit, tend, resurrect, remove, loading the sample data and setting the first-run flag. `classifyWriteError` turns a quota error into "full" and `STORAGE_UNAVAILABLE` into "unavailable"; the App shows `storageProblemText[problem]` in its polite live region, closes the open dialog and any Triage session, and keeps working. The dialogs pass their engine errors to the App through `onWriteError`. Anything not classified is rethrown. Exception: the add/edit form handles a storage problem itself. It stays open with what was typed and shows the sentence inside the form (`role="alert"`), because the page behind a modal dialog is inert and the fix (remove a fact, try again) should not cost the user their text
- **During settle ticks** (`ticking.ts`, `App.tsx`): `startTicking` and `useSettleTicks` take an `onError`. The App classifies the error; a storage problem is announced once, and again only after a tick has saved in between, so a full storage is not repeated every minute. The tick's time still becomes `realNow`, since reads settle in memory. Anything not classified is rethrown
- **No loading state** (task 18.2): every engine call is synchronous, including loading the snapshot, so there is nothing to wait for and no skeleton

### Time Machine Constraints
- Write operations blocked while `previewOffsetMs > 0`: buttons disabled, forms hidden
- User must return to today to make changes

## Testing Strategy

### Unit Tests

**Policy Tests** (`policy.test.ts`):
- The policy passes `checkPolicy` from the engine package (health 0-100, deterministic, never increases between events, JSON-safe init)
- Test `init` for each knowledge level ("new" → 2 days, "shaky" → 5 days, "solid" → 10 days)
- Test `healthAt` exponential decay formula
- Test `applyEvent` correct answer: health → 100, half-life doubled (clamped at 180)
- Test `applyEvent` incorrect answer: health → 45, half-life halved (clamped at 1)
- Test `nextDueAt` for alive (returns future time), weak (returns now), dead (returns null)
- Test `resurrect` success and failure cases

**Outcome Scenarios** (`policy.test.ts`):
- Fact with half-life 10 days ("solid"), no review (health = 100 × 0.5^(days / 10)):
  - Day 7: alive (health ≈ 61.6)
  - Day 8: weak (health ≈ 57.4)
  - Day 33: still weak (health ≈ 10.2)
  - Day 34: dead (health ≈ 9.5, stored as 0)
- Death timing: fact dies within 1 minute after the crossing at 10 × log2(10) ≈ 33.219 days (log2(10) ≈ 3.322 half-lives)

**Autopsy Sentences Tests** (`autopsy-sentences.test.ts`):
- Test that generated sentences contain expected facts (dates, counts, half-life values)
- For three fixed reports (quick death after a wrong answer, long silence, several wrong answers), assert the exact sentences returned

**Sample Data Tests** (`sample-data.test.ts`):
- Verify `loadSampleData` creates 12 facts
- Verify facts are distributed across alive, weak, dead states
- Verify no errors thrown during event replay

### Integration Tests

**App-Level Tests**:
- Add fact → verify it appears in Crypt
- Fight fact (correct) → verify health → 100, half-life doubled
- Fight fact (incorrect) → verify health → 45, half-life halved
- Fact dies → verify it moves to Graveyard
- Challenge fact (correct) → verify resurrection
- Challenge fact (incorrect) → verify stays dead
- Time machine → verify write operations disabled

### Property-Based Tests

Not applicable for Study Dungeon app-level code. The engine itself has property-based tests; the app uses the engine and policy as building blocks.

## Accessibility

### Keyboard Navigation
- All interactive elements reachable via Tab
- Enter/Space activates buttons
- Escape dismisses dialogs

### Visual Accessibility
- State shown via icon + text (never color alone)
- WCAG AA contrast ratios: bone (#f0e6cc) on bg (#060509) = 14.6:1
- `prefers-reduced-motion`: disables all animations (candle flicker, monster shake)

### Screen Readers
- Semantic HTML: `<button>`, `<dialog>`, `<nav>`
- ARIA labels for icon-only buttons
- Live region announcements for state changes

### As built (tasks 16.1, 16.2, 16.4)
- **Focus**: every app dialog opens through `useModalDialog`, which remembers the focused element (the opener) and focuses it again when the dialog closes, if it is still on the page. A dialog opened from inside another (Autopsy → Challenge, the next fight of a session) takes over the first one's opener. FactAutopsy uses `useReturnFocus` for the shell's AutopsyDialog. Escape is the browser's `cancel` event on the modal `<dialog>`; each dialog turns it into its own close action
- **Landmarks**: `<header>` (h1 and tagline), `<main>`, `<nav aria-label="Crypt, Dungeon and Graveyard">` around the list tabs. The tabs keep the WAI-ARIA pattern: only the selected tab is in the Tab order; arrow keys, Home and End move between them
- **Live region**: one polite `aria-live` region at the top of `<main>`, always on the page. It says "Fact added to the Crypt.", "Fact saved.", "Fact removed.", the fight and challenge results with the list the fact is in afterwards (read from the engine), "12 sample facts loaded.", and storage problems. Its words are in `announceText` (wording.ts)
- **Icon-only buttons**: there are none. Every icon sits in an `aria-hidden` wrapper beside words; a test checks that every button has a name in words
- **Reduced motion**: CSS motion is in `animations.css`, and both it and `global.css` switch it off under `prefers-reduced-motion`. The only JS animation is the time machine's Play, which jumps straight to +60 days under reduced motion; a source test checks that nothing else uses `requestAnimationFrame`, `Element.animate`, smooth scrolling or an interval timer (apart from the settle tick)

### Responsive layout (task 18.1, `styles/layout.css`)
- Wide screens: the hero across the top, then two columns: the lists (`minmax(0, 1fr)`) and a side column with the time machine and Triage (`minmax(16rem, 22rem)`)
- Below 640px (`max-width: 639.98px`): one column; the hero's stat cards stack; cards in one column; page padding 0.75rem; the app's dialogs are `calc(100vw - 1rem)` wide and at most `calc(100dvh - 1rem)` tall, scrolling inside; the tour spans the bottom of the screen
- No fixed width, minimum width, flex basis or column minimum in the app's or the shell's CSS is wider than the 296px content box of a 320px screen (checked by `layout-css.test.ts`)

## Visual Rendering

### CSS-Only Visuals
- Candle flame: CSS animation with `@keyframes flicker`
- Monster shake: CSS `transform` on hover
- Tombstone: SVG inline, styled via CSS
- As built: `styles/animations.css`, imported by App.tsx, targets the `data-icon` attributes of the icons in `components/icons.tsx` (candle flame flickers wherever a candle is shown; a monster shakes once when its card is hovered or focused; the tombstone stays still). The same `studyDungeonIcons` are used by the counters, the cards and the autopsy title
- No external images or icon libraries

### Theme Application
- App styles: `global.css` sets the app's own palette at `:root` as `--color-bg`, `--color-stone`, `--font-display`, etc. Only app components use these.
- Shell styles: each shell component sets `--shell-<role>` variables (for example `--shell-alive`, `--shell-panel-hi`, `--shell-font-display`) on its root element from its `theme` prop, and its CSS uses only those. The shell never contains an app's colour names or words; a boundary test in `packages/shell` checks this.
- The app passes `studyDungeonShellTheme` (the palette mapped onto the roles) to every shell component.

## Performance Considerations

### Optimization Targets
- First render: < 1s
- List filtering/sorting: < 100ms for 1000 facts
- Time machine slider: 60fps animation

### Techniques
- Memoize `engine.view(now)` result if `now` unchanged
- Virtual scrolling for lists > 100 items (marked "Could" priority)
- Debounce time machine slider to ~16ms (1 frame)

## Dependencies

### Runtime
- React 18
- Vite (dev/build)
- `@decay-engine/engine` (local package)
- `@decay-engine/shell` (local package)

### Development
- TypeScript
- Vitest
- fast-check (engine tests only, not app tests)

### External (Fonts)
- Google Fonts API: Pirata One, Spectral, IBM Plex Mono
- Loaded via `<link>` in `index.html`

## Deployment

- Static site built via `vite build`
- Deployed to Vercel (same site as landing page, separate route `/study-dungeon`)
- No backend, no serverless functions
- All data in browser localStorage
