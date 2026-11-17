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
│   ├── wording.ts                   # List names, button labels, state names
│   ├── components/
│   │   ├── App.tsx                  # Root component with engine instance
│   │   ├── HeroSection.tsx          # Stats and primary CTA
│   │   ├── ThreeLists.tsx           # Crypt/Dungeon/Graveyard switcher
│   │   ├── FightDialog.tsx          # Review interaction for alive/weak facts
│   │   ├── ChallengeDialog.tsx      # Resurrection interaction for dead facts
│   │   ├── AddEditFactDialog.tsx    # Add/edit fact form
│   │   └── FirstRun.tsx             # Load sample data or start empty
│   ├── main.tsx
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
│   │   └── TimeMachine.tsx          # Slider + quick-jump buttons + play
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
interface ThemeProps {
  colors: Record<string, string>
  fonts: Record<string, string>
}

interface WordingProps {
  lists: { alive: string; weak: string; dead: string }
  actions: { tend: string; resurrect: string }
  states: { alive: string; weak: string; dead: string }
}

interface CountersProps {
  alive: number
  weak: number
  dead: number
  theme: ThemeProps
  wording: WordingProps
}

interface ItemCardProps<Payload, PolicyData> {
  item: Item<Payload, PolicyData>
  state: "alive" | "weak" | "dead"
  theme: ThemeProps
  wording: WordingProps
  onAction?: () => void
}

interface TriagePanelProps<Payload, PolicyData> {
  candidates: TriageCandidate<Payload, PolicyData>[]
  picks: TriageCandidate<Payload, PolicyData>[]
  others: TriageCandidate<Payload, PolicyData>[]
  theme: ThemeProps
  onStartSession: (picks: TriageCandidate<Payload, PolicyData>[]) => void
}

interface AutopsyDialogProps<Event> {   // generic: the shell never imports app types
  report: AutopsyReport<Event>
  epitaph?: string
  theme: ThemeProps
  causeSentences: string[]  // Generated by autopsy-sentences.ts
}

interface TimeMachineProps {
  now: number
  minTime: number
  maxTime: number
  theme: ThemeProps
  onChange: (newNow: number) => void
  onReset: () => void
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
├── TriagePanel (from shell)
├── AutopsyDialog (from shell)
├── TimeMachine (from shell)
└── FirstRun
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

export const wording = {
  lists: {
    alive: "Crypt",
    weak: "Dungeon",
    dead: "Graveyard"
  },
  actions: {
    tend: "Fight",
    resurrect: "Challenge"
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
- If weak facts exist: "N facts are weakening" + button "Fight the weakest" → opens FightDialog with weakest fact
- If no weak but alive exist: encouraging message
- Stats: three cards showing alive, weak, dead counts

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

### Time Machine

**UI Elements** (uses `TimeMachine` from shell):
- Slider: today to +60 days
- Quick-jump buttons: +7, +14, +30 days
- Play button: animates from today to +60 days
- "Back to today" button

**State Management**:
- Moving slider updates `previewOffsetMs` → all screens re-render with `engine.view(now)` etc.
- Banner: "Future preview · nothing is saved"
- Write operations disabled while `previewOffsetMs > 0`

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

**Optional Tour**:
- 3-4 tooltips explaining Crypt, Dungeon, Fight (marked "Could" priority)

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
- Death timing: fact dies within 1 minute after 33.22 days (log2(10) ≈ 3.322 half-lives)

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

## Visual Rendering

### CSS-Only Visuals
- Candle flame: CSS animation with `@keyframes flicker`
- Monster shake: CSS `transform` on hover
- Tombstone: SVG inline, styled via CSS
- No external images or icon libraries

### Theme Application
- CSS custom properties set at root: `--color-bg`, `--font-display`, etc.
- Shell components reference custom properties
- App sets custom properties from theme object

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
