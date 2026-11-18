// Study Dungeon state icons: candle (alive, sleeping in the Crypt), monster
// (weak, in the Dungeon) and tombstone (dead, in the Graveyard).
// Inline SVG drawn with currentColor; the shell colours them per state and
// always shows them beside the state's words. Animations come in task 17.

import type { StateIcons } from "@decay-engine/shell"

function CandleIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" data-icon="candle">
      <path d="M12 2.5c1.6 2 2.4 3.4 2.4 4.6a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.6 2.4-4.6z" fill="currentColor" />
      <rect x="9" y="11" width="6" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="7" y1="21.2" x2="17" y2="21.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function MonsterIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" data-icon="monster">
      <path
        d="M4 20V11a8 8 0 0 1 16 0v9l-2.7-1.8L14.7 20 12 18.2 9.3 20l-2.6-1.8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="9.2" cy="10.5" r="1.4" fill="currentColor" />
      <circle cx="14.8" cy="10.5" r="1.4" fill="currentColor" />
    </svg>
  )
}

function TombstoneIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" data-icon="tombstone">
      <path
        d="M6 21V10a6 6 0 0 1 12 0v11z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <line x1="12" y1="8" x2="12" y2="15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="9.5" y1="10.5" x2="14.5" y2="10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="4" y1="21.2" x2="20" y2="21.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export const studyDungeonIcons: StateIcons = {
  alive: <CandleIcon />,
  weak: <MonsterIcon />,
  dead: <TombstoneIcon />,
}
