// Sample street for the first run (task 4.13, design section 6; Req 20.3-20.5,
// 20.8, 16.2, 10.2).
//
// Twelve fictional people, four lit, four flickering and four boarded up.
// Their histories are replayed through the real engine at past times
// (addItem, tend, resurrect), then the engine is ticked at `now`, so every
// person reaches their state by the policy's own rules. Times are whole days
// before `now`, so the result does not depend on the time of day.
//
// The arithmetic (design section 6.1): for rhythm r days, T = 3r days, and a
// person whose effective last contact was a days ago has freshness
// 100 × (1 − a / 3r): lit while a ≤ 1.2r, flickering while a ≤ 2.7r, dark
// after. A call, a meet-up or a reconnect sets a = 0; a text sets
// a → max(0, a − 1.2r). Every contact below happens while the person is not
// dark, and every final age keeps at least a day from the nearest boundary.
//
// Ten names come from the wireframe's sample list; "Aunt Sunita" became
// Sunita Rao, and one name is new (design section 6.2).

import type { ItemState } from "@decay-engine/shell"
import type { GhostedEngine } from "./engine-instance"
import type { ContactEvent } from "./policy"
import { DAY_MS } from "./time"

type ContactKind = ContactEvent["kind"]

/** One logged contact, in whole days before now. `reconnect` replays it as engine.resurrect. */
export type SampleStep = { daysAgo: number; kind: ContactKind; reconnect?: true }

export type SamplePerson = {
  name: string
  relationship: string
  rhythmDays: number
  importance: 1 | 2 | 3
  costMinutes: number
  /** When the person was added, in whole days before now. */
  addedDaysAgo: number
  /** payload.lastContactAt = now − lastContactDaysAgo × DAY_MS. */
  lastContactDaysAgo: number
  /** Later contacts, oldest first. */
  steps: SampleStep[]
  /** The state at now; checked by the tests. */
  expected: ItemState
  /** Alive after a reconnect: shown as "lit again". */
  litAgain?: true
  /** Dark from the moment they were added ("created" and "died" at the same time). */
  startsDark?: true
}

const step = (daysAgo: number, kind: ContactKind): SampleStep => ({ daysAgo, kind })

export const SAMPLE_PEOPLE: readonly SamplePerson[] = [
  // ---- lit ----
  {
    // r 30 (T 90, weak after 36, dark after 81). Call −30 (a 30) → L −30.
    // Text −12 (a 18, h 80 → 100) → L −12. Now a 12: 86.67. Fades +24, dark +69.
    name: "Priya Raman",
    relationship: "Family",
    rhythmDays: 30,
    importance: 3,
    costMinutes: 15,
    addedDaysAgo: 60,
    lastContactDaysAgo: 60,
    steps: [step(30, "call"), step(12, "text")],
    expected: "alive",
  },
  {
    // r 14 (T 42, weak after 16.8, dark after 37.8). Meet-up −30 (a 10) → L −30.
    // Text −18 (a 12, h 71.43 → 100) → L −18. Call −5 (a 13) → L −5.
    // Now a 5: 88.10. Fades +11.8, dark +32.8. All three kinds.
    name: "Sam Rivera",
    relationship: "College",
    rhythmDays: 14,
    importance: 2,
    costMinutes: 10,
    addedDaysAgo: 40,
    lastContactDaysAgo: 40,
    steps: [step(30, "meetup"), step(18, "text"), step(5, "call")],
    expected: "alive",
  },
  {
    // r 7 (T 21, weak after 8.4, dark after 18.9). Call −13 (a 7) → L −13.
    // Call −6 (a 7) → L −6. Now a 6: 71.43. Fades +2.4, dark +12.9.
    name: "Sunita Rao",
    relationship: "Family",
    rhythmDays: 7,
    importance: 3,
    costMinutes: 15,
    addedDaysAgo: 20,
    lastContactDaysAgo: 20,
    steps: [step(13, "call"), step(6, "call")],
    expected: "alive",
  },
  {
    // r 45 (T 135, weak after 54, dark after 121.5). Call −180 → L −180; dark
    // at −58.5. Reconnect by meet-up −20 (a 160, dead) → L −20, health 100.
    // Now a 20: 85.19, lit again. Fades +34, dark +101.5.
    name: "Nia Bello",
    relationship: "Work",
    rhythmDays: 45,
    importance: 2,
    costMinutes: 15,
    addedDaysAgo: 200,
    lastContactDaysAgo: 200,
    steps: [step(180, "call"), { daysAgo: 20, kind: "meetup", reconnect: true }],
    expected: "alive",
    litAgain: true,
  },

  // ---- flickering ----
  {
    // r 45. Added −120 with last contact −150 (a 30, lit). Text −70 (a 80,
    // h 40.74 → 80.74; a' = 80 − 54 = 26) → L −96. Now a 96: 28.89. Dark +25.5.
    name: "Dan Okafor",
    relationship: "Work",
    rhythmDays: 45,
    importance: 2,
    costMinutes: 5,
    addedDaysAgo: 120,
    lastContactDaysAgo: 150,
    steps: [step(70, "text")],
    expected: "weak",
  },
  {
    // r 30. Call −51 (a 30) → L −51. Now a 51: 43.33. Dark +30.
    name: "Grace Liu",
    relationship: "Neighbours",
    rhythmDays: 30,
    importance: 1,
    costMinutes: 15,
    addedDaysAgo: 81,
    lastContactDaysAgo: 81,
    steps: [step(51, "call")],
    expected: "weak",
  },
  {
    // r 21 (T 63, weak after 25.2, dark after 56.7). Call −60 (a 30, weak,
    // not dark) → L −60. Call −35 (a 25) → L −35. Now a 35: 44.44. Dark +21.7.
    name: "Meera Joshi",
    relationship: "College",
    rhythmDays: 21,
    importance: 3,
    costMinutes: 25,
    addedDaysAgo: 90,
    lastContactDaysAgo: 90,
    steps: [step(60, "call"), step(35, "call")],
    expected: "weak",
  },
  {
    // r 90 (T 270, weak after 108, dark after 243). Meet-up −250 (a 50) → L −250.
    // Call −140 (a 110) → L −140. Now a 140: 48.15. Dark +103.
    name: "Joel Kim",
    relationship: "Work",
    rhythmDays: 90,
    importance: 3,
    costMinutes: 30,
    addedDaysAgo: 300,
    lastContactDaysAgo: 300,
    steps: [step(250, "meetup"), step(140, "call")],
    expected: "weak",
  },

  // ---- boarded up ----
  {
    // r 60 (T 180, dark after 162). Call −330 (a 70) → L −330. Text −250
    // (a 80, h 55.56 → 95.56; a' = 8) → L −258. Went dark at −96.
    name: "Leo Marchetti",
    relationship: "Neighbours",
    rhythmDays: 60,
    importance: 1,
    costMinutes: 20,
    addedDaysAgo: 400,
    lastContactDaysAgo: 400,
    steps: [step(330, "call"), step(250, "text")],
    expected: "dead",
  },
  {
    // r 120 (T 360, dark after 324). No tag: the "Others" house. Added −30
    // with last contact −400 (a 370 > 324): started dark, "created" and
    // "died" both at −30; the gap to diedAt is 370 days.
    name: "Tomas Novak",
    relationship: "",
    rhythmDays: 120,
    importance: 1,
    costMinutes: 20,
    addedDaysAgo: 30,
    lastContactDaysAgo: 400,
    steps: [],
    expected: "dead",
    startsDark: true,
  },
  {
    // r 14 (dark after 37.8). Meet-up −100 (a 20) → L −100. Call −70 (a 30)
    // → L −70. Went dark at −32.2.
    name: "Ayesha Khan",
    relationship: "College",
    rhythmDays: 14,
    importance: 2,
    costMinutes: 15,
    addedDaysAgo: 120,
    lastContactDaysAgo: 120,
    steps: [step(100, "meetup"), step(70, "call")],
    expected: "dead",
  },
  {
    // r 21 (T 63, dark after 56.7). Added −200 with last contact −210 (a 10,
    // lit). Call −180 (a 30) → L −180. Text −150 (a 30, h 52.38 → 92.38;
    // a' = 4.8) → L −154.8. Went dark at −98.1.
    name: "Harun Aziz",
    relationship: "Family",
    rhythmDays: 21,
    importance: 2,
    costMinutes: 20,
    addedDaysAgo: 200,
    lastContactDaysAgo: 210,
    steps: [step(180, "call"), step(150, "text")],
    expected: "dead",
  },
]

type SampleEngine = Pick<GhostedEngine, "addItem" | "tend" | "resurrect" | "tick">

/**
 * Adds the twelve sample people at their past times, replays their contacts
 * (a reconnect step through engine.resurrect, the others through
 * engine.tend), then ticks at `now` so deaths and crossings are saved with
 * their real times. Returns the new ids in SAMPLE_PEOPLE order.
 *
 * Throws whatever the engine throws; the sample is built so that no contact
 * reaches a dark window and every reconnect reaches one.
 */
export function loadSampleData(engine: SampleEngine, now: number): string[] {
  const at = (daysAgo: number) => now - daysAgo * DAY_MS
  const ids: string[] = []
  for (const person of SAMPLE_PEOPLE) {
    const id = engine.addItem(
      {
        payload: {
          name: person.name,
          relationship: person.relationship,
          rhythmDays: person.rhythmDays,
          lastContactAt: at(person.lastContactDaysAgo),
        },
        importance: person.importance,
        costMinutes: person.costMinutes,
      },
      at(person.addedDaysAgo)
    )
    for (const s of person.steps) {
      const event: ContactEvent = { kind: s.kind }
      if (s.reconnect === true) {
        const outcome = engine.resurrect(id, event, at(s.daysAgo))
        // The Ghosted policy never refuses (Req 4.2); a refusal would be a bug, never hidden.
        if (!outcome.ok) throw new Error(`sample reconnect for ${person.name} was refused: ${outcome.reason}`)
      } else {
        engine.tend(id, event, at(s.daysAgo))
      }
    }
    ids.push(id)
  }
  engine.tick(now)
  return ids
}
