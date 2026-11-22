// Sample data for the first run (task 11.1, Requirement 13.2-13.3).
//
// Twelve facts, four for each knowledge level. Their histories are replayed
// through the real engine at past times (addItem, tend, resurrect), then the
// engine is ticked at `now`, so every fact reaches its state by the policy's
// own rules: four alive, four weak and four dead.
//
// Times are whole days before `now`, so the outcome does not depend on the
// time of day. Each schedule below shows the policy maths and keeps a margin
// of at least a day from the nearest state boundary:
//   after a right answer: health 100, alive while t ≤ 0.737 × half-life,
//     dead once t > 3.32 × half-life (log2(100/60) and log2(100/10))
//   after a wrong answer: health 45 (weak at once), dead once
//     t > 2.17 × half-life (log2(45/10))
// Half-lives start at 2 (new), 5 (shaky) or 10 (solid) days, double on a
// right answer and halve on a wrong one (1-180).
//
// Questions 1-9 come from the Study Dungeon wireframe; 10-12 are new.
//
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.

import type { DecayEngine } from "@decay-engine/engine"
import { DAY_MS, type FactPayload, type FactPolicyData, type Knowledge, type ReviewEvent } from "./policy"

/** One step in a sample fact's history, in whole days before now. */
export type SampleStep =
  | { daysAgo: number; kind: "review"; correct: boolean }
  | { daysAgo: number; kind: "challenge"; correct: boolean }

export type SampleFact = {
  question: string
  answer: string
  why: string
  knowledge: Knowledge
  importance: 1 | 2 | 3
  costMinutes: 1 | 2 | 3 | 5
  /** When it was added, in whole days before now. */
  addedDaysAgo: number
  /** Later steps, oldest first. */
  steps: SampleStep[]
  /** The state it must be in at now; checked by the tests. */
  expected: "alive" | "weak" | "dead"
}

const right = (daysAgo: number): SampleStep => ({ daysAgo, kind: "review", correct: true })
const wrong = (daysAgo: number): SampleStep => ({ daysAgo, kind: "review", correct: false })

export const SAMPLE_FACTS: readonly SampleFact[] = [
  // ---- alive ----
  {
    // shaky 5. Right on day -14 (4 days: health 57) → 10. Right on -6 (8 days: 57) → 20.
    // Now: 6 days at half-life 20 → 81. Alive until 14.7 days after -6.
    question: "Capital of Australia?",
    answer: "Canberra",
    why: "Geography quiz on 12 Dec.",
    knowledge: "shaky",
    importance: 2,
    costMinutes: 2,
    addedDaysAgo: 18,
    steps: [right(14), right(6)],
    expected: "alive",
  },
  {
    // solid 10. Right on -8 (6 days: 66) → 20. Now: 8 days at 20 → 76. Alive until 14.7 days.
    question: "Time cost of binary search?",
    answer: "O(log n)",
    why: "Asked in nearly every coding interview.",
    knowledge: "solid",
    importance: 3,
    costMinutes: 3,
    addedDaysAgo: 14,
    steps: [right(8)],
    expected: "alive",
  },
  {
    // new 2. Right on -10 (2 days: 50) → 4. Right on -6 (4 days: 50) → 8.
    // Right on -2 (4 days: 71) → 16. Now: 2 days at 16 → 92. Alive until 11.8 days.
    question: "Unit of electrical resistance?",
    answer: "The ohm (Ω)",
    why: "Physics practical exam.",
    knowledge: "new",
    importance: 1,
    costMinutes: 2,
    addedDaysAgo: 12,
    steps: [right(10), right(6), right(2)],
    expected: "alive",
  },
  {
    // solid 10. Right on -2 (6 days: 66) → 20. Now: 2 days at 20 → 93.
    question: "TCP handshake, in order?",
    answer: "SYN, SYN-ACK, ACK",
    why: "Networking lab 3.",
    knowledge: "solid",
    importance: 2,
    costMinutes: 3,
    addedDaysAgo: 8,
    steps: [right(2)],
    expected: "alive",
  },

  // ---- weak ----
  {
    // shaky 5. Right on -12 (4 days: 57) → 10. Now: 12 days at 10 → 43.5.
    // Weak from 7.4 to 33.2 days after -12.
    question: "Derivative of ln x?",
    answer: "1/x",
    why: "On the calculus formula sheet.",
    knowledge: "shaky",
    importance: 3,
    costMinutes: 2,
    addedDaysAgo: 16,
    steps: [right(12)],
    expected: "weak",
  },
  {
    // solid 10. Right on -15 (5 days: 71) → 20. Wrong on -9 (6 days: 81) → 45, 10.
    // Now: 9 days at 10 → 24.1. Dead 21.7 days after -9.
    question: "What does the mitochondrion do?",
    answer: "Makes ATP, the cell's usable energy",
    why: "Biology exam, chapter 4.",
    knowledge: "solid",
    importance: 2,
    costMinutes: 5,
    addedDaysAgo: 20,
    steps: [right(15), wrong(9)],
    expected: "weak",
  },
  {
    // shaky 5. Right on -15 (5 days: 50) → 10. Now: 15 days at 10 → 35.4.
    question: "Treaty that ended the Thirty Years' War?",
    answer: "Peace of Westphalia, 1648",
    why: "History essay due Friday.",
    knowledge: "shaky",
    importance: 3,
    costMinutes: 3,
    addedDaysAgo: 20,
    steps: [right(15)],
    expected: "weak",
  },
  {
    // new 2. Right on -8 (2 days: 50) → 4. Now: 8 days at 4 → 25. Dead 13.3 days after -8.
    question: "Enzyme that unwinds DNA?",
    answer: "Helicase",
    why: "Genetics exam, topic 2.",
    knowledge: "new",
    importance: 2,
    costMinutes: 3,
    addedDaysAgo: 10,
    steps: [right(8)],
    expected: "weak",
  },

  // ---- dead ----
  {
    // solid 10. Right on -42 (8 days: 57) → 20. Wrong on -30 (12 days: 66) → 45, 10.
    // Right on -28 (2 days: 39) → 20. Wrong on -26 (2 days: 93) → 45, 10.
    // Died 10 × log2(4.5) = 21.7 days after -26, about 4.3 days ago.
    // Autopsy: two missed answers kept the half-life at 10 (10 → 20 → 10 → 20 → 10).
    question: "Who wrote Frankenstein?",
    answer: "Mary Shelley, 1818",
    why: "Book club on Sunday.",
    knowledge: "solid",
    importance: 1,
    costMinutes: 2,
    addedDaysAgo: 50,
    steps: [right(42), wrong(30), right(28), wrong(26)],
    expected: "dead",
  },
  {
    // new 2, never reviewed. Died 2 × log2(10) = 6.6 days after -40, about 33 days ago.
    question: "Who painted the Sistine Chapel ceiling?",
    answer: "Michelangelo",
    why: "Art history quiz.",
    knowledge: "new",
    importance: 1,
    costMinutes: 1,
    addedDaysAgo: 40,
    steps: [],
    expected: "dead",
  },
  {
    // shaky 5. Right on -40 (5 days: 50) → 10. Died 10 × log2(10) = 33.2 days later,
    // about 6.8 days ago. A failed challenge 3 days ago leaves it dead and shows
    // in the autopsy.
    question: "Chemical symbol for gold?",
    answer: "Au",
    why: "Chemistry flashcards for Monday.",
    knowledge: "shaky",
    importance: 2,
    costMinutes: 1,
    addedDaysAgo: 45,
    steps: [right(40), { daysAgo: 3, kind: "challenge", correct: false }],
    expected: "dead",
  },
  {
    // new 2. Right on -28 (2 days: 50) → 4. Died 4 × log2(10) = 13.3 days later,
    // about 14.7 days ago.
    question: "Speed of light in a vacuum?",
    answer: "About 300,000 km per second",
    why: "Physics formula sheet.",
    knowledge: "new",
    importance: 2,
    costMinutes: 2,
    addedDaysAgo: 30,
    steps: [right(28)],
    expected: "dead",
  },
]

type SampleEngine = Pick<
  DecayEngine<FactPayload, FactPolicyData, ReviewEvent>,
  "addItem" | "tend" | "resurrect" | "tick"
>

/**
 * Adds the twelve sample facts to the engine by replaying their histories at
 * past times, then ticks at `now` so deaths and weak crossings are saved with
 * their real times. Returns the new ids, in SAMPLE_FACTS order.
 *
 * Throws whatever the engine throws; the sample is built so that no step acts
 * on a fact that is already dead.
 */
export function loadSampleData(engine: SampleEngine, now: number): string[] {
  const at = (daysAgo: number) => now - daysAgo * DAY_MS
  const ids: string[] = []
  for (const fact of SAMPLE_FACTS) {
    const id = engine.addItem(
      {
        payload: { question: fact.question, answer: fact.answer, why: fact.why, knowledge: fact.knowledge },
        importance: fact.importance,
        costMinutes: fact.costMinutes,
      },
      at(fact.addedDaysAgo)
    )
    for (const step of fact.steps) {
      const event: ReviewEvent = { kind: "review", correct: step.correct }
      if (step.kind === "review") engine.tend(id, event, at(step.daysAgo))
      else engine.resurrect(id, event, at(step.daysAgo))
    }
    ids.push(id)
  }
  engine.tick(now)
  return ids
}
