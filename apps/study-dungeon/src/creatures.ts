// Creatures for the visual pass (docs/design/study-dungeon-visual-pass.md,
// Pass 2). Every fact gets a creature kind and a name, chosen from its id so
// they never change between renders or reloads. A creature's mood comes from
// the fact's state and health.
//
// Pure: no clock reads, no engine calls. Ported from the wireframe
// (docs/design/study-dungeon-wireframe.html).
//
// Written by - Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { THRESHOLDS, type Fact } from "./policy"

export type CreatureKind = "slime" | "bat" | "imp" | "eye"

/**
 * sleep: alive, resting in the Crypt.
 * worried: weak, health at or above FERAL_BELOW.
 * feral: weak and below FERAL_BELOW, or a dead fact rising for a challenge.
 * happy: just answered right.
 */
export type Mood = "sleep" | "worried" | "feral" | "happy"

export const CREATURE_KINDS: readonly CreatureKind[] = ["slime", "bat", "imp", "eye"]

export const CREATURES: Record<CreatureKind, { color: string; names: readonly string[] }> = {
  slime: {
    color: "#9cf26b",
    names: ["Gloop", "Squelch", "Blorp", "Ooze", "Gunk", "Splodge", "Wobble", "Sludgy", "Drool", "Burble", "Mucky", "Glorp"],
  },
  bat: {
    color: "#b48cff",
    names: ["Batsy", "Flitter", "Nibbles", "Wisp", "Fang", "Echo", "Dusk", "Flap", "Squeak", "Vesper", "Nyx", "Morsel"],
  },
  imp: {
    color: "#ff8a2b",
    names: ["Skulky", "Rattle", "Gnash", "Cinder", "Grub", "Snik", "Pyre", "Mischief", "Scorch", "Grizzle", "Smudge", "Krik"],
  },
  eye: {
    color: "#4fd8e8",
    names: ["Peeper", "Gawk", "Blink", "Squint", "Ogle", "Glint", "Stare", "Lurk", "Iris", "Gaze", "Wink", "Leer"],
  },
}

/** Below this health a weak creature turns feral. */
export const FERAL_BELOW = 35

/** FNV-1a, 32-bit: a small stable hash, so the same id always gets the same creature. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export type CreatureIdentity = { kind: CreatureKind; name: string; color: string }

// Names given out so far, so no two facts share one (see nameCreatures).
let registry = new Map<string, string>()

/** The creature that stands for a fact: its kind, name and colour. */
export function creatureOf(id: string): CreatureIdentity {
  const h = hash(id)
  const kind = CREATURE_KINDS[h % CREATURE_KINDS.length]!
  const { color, names } = CREATURES[kind]
  const name = registry.get(id) ?? names[Math.floor(h / CREATURE_KINDS.length) % names.length]!
  return { kind, name, color }
}

const ROMAN = ["", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"]

/**
 * Gives every fact a different name. Facts are named oldest first (then by
 * id), each taking its usual name or, when that is taken, the next free one
 * of its kind; when a kind runs out, names repeat with II, III and so on.
 * The same facts always get the same names, and a fact keeps its name when
 * newer facts are added. Returns the names; creatureOf reads them.
 */
export function nameCreatures(facts: readonly { id: string; createdAt: number }[]): Map<string, string> {
  const taken = new Set<string>()
  const names = new Map<string, string>()
  const order = [...facts].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const fact of order) {
    const h = hash(fact.id)
    const pool = CREATURES[CREATURE_KINDS[h % CREATURE_KINDS.length]!].names
    const start = Math.floor(h / CREATURE_KINDS.length) % pool.length
    let chosen: string | undefined
    for (let round = 0; chosen === undefined; round++) {
      for (let i = 0; i < pool.length; i++) {
        const candidate = pool[(start + i) % pool.length]! + (ROMAN[round] ?? ` ${round + 1}`)
        if (!taken.has(candidate)) {
          chosen = candidate
          break
        }
      }
    }
    taken.add(chosen)
    names.set(fact.id, chosen)
  }
  registry = names
  return names
}

/** The mood rule from the brief: alive sleeps; weak is worried, or feral below 35; dead rises feral. */
export function moodOf(state: Fact["state"], health: number): Mood {
  if (state === "alive") return "sleep"
  if (state === "dead") return "feral"
  return health >= FERAL_BELOW ? "worried" : "feral"
}

export type Urgency = { text: string; critical: boolean }

/** How urgent a weak fact is, in words. Critical ones are shown in blood red. */
export function urgencyOf(health: number): Urgency {
  if (health < 20) return { text: "Nearly forgotten", critical: true }
  if (health < 40) return { text: "Review now", critical: true }
  return { text: "Review soon", critical: false }
}

/** What the creature says on its card. */
export function quipOf(mood: Mood): string {
  switch (mood) {
    case "feral":
      return "Last chance. Feed me an answer."
    case "worried":
      return "Psst. Remember me?"
    case "happy":
      return "Ahh. I feel strong again."
    case "sleep":
      return "Zzz… do not wake me yet."
  }
}

/** Where the weak and dead marks sit on a health bar (0-100). */
export const HEALTH_MARKS = { weak: THRESHOLDS.weak, dead: THRESHOLDS.dead } as const
