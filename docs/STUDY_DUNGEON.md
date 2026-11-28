# Study Dungeon: details

Moved here from the README to keep it short. See the README for the policy table.

## Two decay policies, one switch

The default policy halves health every half-life since the last review. Settings also has a **Memory model** switch, a second policy (`apps/study-dungeon/src/policy-memory.ts`) that adds two ideas from spaced-repetition research:

- A right answer helps more the later it comes (the spacing effect).
- Every fact has a difficulty that wrong answers raise and right answers lower, so hard facts gain less.

It is inspired by FSRS but is not FSRS, and its constants are hand-picked, not fitted to anyone's data. Both policies keep the same saved data, so switching never loses a fact. Its spec is in `.kiro/specs/extensions/`.

## Bring your own facts

Import takes pasted lines or a file:

- `question | answer`
- tab-separated rows
- CSV (quoted cells may run over several lines, and a `Front,Back` header row is skipped)
- Anki text exports (their HTML is turned into plain text)

## The three lists

- **The Crypt**: healthy facts, asleep.
- **The Dungeon**: weak facts, weakest first.
- **The Graveyard**: forgotten for too long. Challenge a grave to bring it back.
