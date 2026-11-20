// Hunter ranks: a title earned from souls banished (right answers), and how
// far it is to the next one. Pure.
//
// Written by - Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

export type Rank = { title: string; from: number }

export const RANKS: readonly Rank[] = [
  { title: "Candle Bearer", from: 0 },
  { title: "Apprentice Exorcist", from: 10 },
  { title: "Monster Hunter", from: 25 },
  { title: "Crypt Warden", from: 50 },
  { title: "Dungeon Master", from: 100 },
  { title: "Lich Slayer", from: 200 },
]

export type RankProgress = {
  rank: Rank
  next: Rank | null
  /** 0 to 1: how far from this rank to the next (1 at the top rank). */
  progress: number
  /** Souls still needed for the next rank; 0 at the top rank. */
  toNext: number
}

export function rankOf(souls: number): RankProgress {
  const n = Math.max(0, Math.floor(souls))
  let index = 0
  for (let i = 0; i < RANKS.length; i++) if (n >= RANKS[i]!.from) index = i
  const rank = RANKS[index]!
  const next = RANKS[index + 1] ?? null
  if (next === null) return { rank, next, progress: 1, toNext: 0 }
  return { rank, next, progress: (n - rank.from) / (next.from - rank.from), toNext: next.from - n }
}
