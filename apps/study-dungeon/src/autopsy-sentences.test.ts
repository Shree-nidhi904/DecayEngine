// Tests for the cause-of-death sentences (task 10.2).
//
// Every report is built through the real DecayEngine (InMemoryAdapter, a
// counter id generator, fixed timestamps) and passed to generateCauseSentences
// with timeZone "UTC". The expected sentences are worked out by hand from the
// policy maths and written in the comments; they are not copied from the
// function's output.
//
// Maths used throughout (requirements.md 1-4):
//   health(t) = stored health × 0.5^(elapsed / half-life)
//   stored health h falls below 60 after  half-life × log2(h / 60)
//   stored health h falls below 10 after  half-life × log2(h / 10)
//   so from 100: weak after 0.73697 half-lives, dead after 3.32193 half-lives
//   right answer: health 100, half-life × 2 (max 180)
//   wrong answer: health 45,  half-life ÷ 2 (min 1)
//   first half-life: new 2, shaky 5, solid 10
// Day 0 is T0 = 1 Oct 2026. Day n is 1 Oct + n days: day 31 = 1 Nov, day 61 = 1 Dec,
// day 92 = 1 Jan, day 123 = 1 Feb. The engine dates crossings up to 1 minute late, and
// every date below is hours away from midnight, so the day shown does not change.

import { describe, expect, it } from "vitest"
import { DecayEngine, InMemoryAdapter, type AutopsyReport } from "@decay-engine/engine"
import { formatDuration, generateCauseSentences, halfLifeChain } from "./autopsy-sentences"
import {
  studyDungeonPolicy,
  type FactPayload,
  type FactPolicyData,
  type Knowledge,
  type ReviewEvent,
} from "./policy"

const T0 = Date.UTC(2026, 9, 1) // 1 Oct 2026, fixed
const DAY = 86_400_000
const UTC = { timeZone: "UTC" }

const RIGHT: ReviewEvent = { kind: "review", correct: true }
const WRONG: ReviewEvent = { kind: "review", correct: false }

type Step = { day: number; do: "right" | "wrong" | "revive-right" | "revive-wrong" }

type Built = {
  report: AutopsyReport<ReviewEvent>
  payload: FactPayload
  /** The dead item's policyData.halfLifeDays from engine.view, as the app passes it. */
  halfLifeAtDeath: number
}

// Adds a fact on day 0, applies the steps, ticks on endDay (so the death is saved
// with its bisected time, as the app does) and returns the autopsy report.
function buildDeadFact(knowledge: Knowledge, steps: Step[], endDay: number): Built {
  let n = 0
  const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
    studyDungeonPolicy,
    new InMemoryAdapter(),
    () => `fact-${++n}`
  )
  const payload: FactPayload = {
    question: "Capital of Peru?",
    answer: "Lima",
    why: "Trip planned",
    knowledge,
  }
  const id = engine.addItem({ payload, importance: 2, costMinutes: 2 }, T0)

  for (const step of steps) {
    const at = T0 + step.day * DAY
    if (step.do === "right") engine.tend(id, RIGHT, at)
    else if (step.do === "wrong") engine.tend(id, WRONG, at)
    else if (step.do === "revive-right") expect(engine.resurrect(id, RIGHT, at)).toEqual({ ok: true })
    else expect(engine.resurrect(id, WRONG, at).ok).toBe(false)
  }

  const now = T0 + endDay * DAY
  engine.tick(now)
  const report = engine.autopsy(id, now)
  const dead = engine.view(now).find((i) => i.id === id)
  if (dead === undefined) throw new Error("test setup: the fact is missing from view")
  expect(dead.state).toBe("dead")
  return { report, payload, halfLifeAtDeath: dead.policyData.halfLifeDays }
}

describe("generateCauseSentences", () => {
  it("never reviewed: faded with its first half-life", () => {
    // Solid: half-life 10. Weak after 10 × log2(100/60) = 7.37 days → day 7 = 8 Oct.
    // Dead after 10 × log2(10) = 33.22 days → day 33 = 3 Nov. Silence 33.22 days → "33 days".
    const { report, payload } = buildDeadFact("solid", [], 40)

    expect(generateCauseSentences(report, payload, UTC)).toEqual([
      "It was never reviewed, so it faded with a half-life of 10 days.",
      "Went weak on 8 Oct 2026.",
      "Died on 3 Nov 2026.",
      "You were silent for 33 days.",
    ])
  })

  it("long silence after the half-life grew", () => {
    // Solid: 10. Right on day 5 → 20. Right on day 15 → 40 (health 100 on day 15).
    // Weak after 40 × log2(100/60) = 29.48 days → day 44.48 = 14 Nov (day 31 = 1 Nov, +13).
    // Dead after 40 × log2(10) = 132.88 days → day 147.88 = 25 Feb 2027 (day 123 = 1 Feb, +24).
    // Last review day 15 = 16 Oct, right. Silence 132.88 days → "133 days".
    // Half-lives of silence: 132.88 / 40 = 3.32 → "3.3". Chain 10 → 20 → 40, grew. 2 reviews, 0 missed.
    const { report, payload } = buildDeadFact(
      "solid",
      [
        { day: 5, do: "right" },
        { day: 15, do: "right" },
      ],
      150
    )

    expect(generateCauseSentences(report, payload, UTC)).toEqual([
      "The half-life grew to 40 days (10 → 20 → 40), then no review came for 133 days. That is about 3.3 half-lives of silence.",
      "Went weak on 14 Nov 2026.",
      "Died on 25 Feb 2027.",
      "Last reviewed on 16 Oct 2026 (you knew it).",
      "You were silent for 133 days.",
      "You got all 2 reviews right.",
    ])
  })

  it("several wrong answers: the half-life kept shrinking", () => {
    // Solid: 10. Wrong on day 1 (health 93.3, alive) → health 45, half-life 5, weak on 2 Oct.
    // Wrong on day 2 (health 45 × 0.5^(1/5) = 39.2, weak) → half-life 2.5.
    // Wrong on day 3 (health 45 × 0.5^(1/2.5) = 34.1, weak) → half-life 1.25.
    // Dead after 1.25 × log2(45/10) = 1.25 × 2.17 = 2.71 days → day 5.71 = 6 Oct.
    // Last review day 3 = 4 Oct, wrong. Silence 2.71 days → "3 days". 3 of 3 missed.
    const { report, payload } = buildDeadFact(
      "solid",
      [
        { day: 1, do: "wrong" },
        { day: 2, do: "wrong" },
        { day: 3, do: "wrong" },
      ],
      10
    )

    expect(generateCauseSentences(report, payload, UTC)).toEqual([
      "Missed answers kept cutting the half-life (10 → 5 → 2.5 → 1.25 days). It never grew long enough to survive a gap.",
      "Went weak on 2 Oct 2026.",
      "Died on 6 Oct 2026.",
      "Last reviewed on 4 Oct 2026 (you forgot it).",
      "You were silent for 3 days.",
      "You missed 3 of 3 reviews.",
    ])
  })

  it("exactly two wrong answers and a final half-life no longer than the first still gives the missed-answers cause", () => {
    // Pins the "2 or more misses" boundary: the three-miss scenario above cannot tell 2 from 3.
    // Solid: 10. Wrong day 1 (health 93.3, alive) → health 45, half-life 5, weak on 2 Oct.
    // Right day 2 (45 × 0.5^(1/5) = 39.2, weak) → 100, half-life 10, alive again, so that weak spell does not count.
    // Wrong day 4 (100 × 0.5^(2/10) = 87.1, alive) → health 45, half-life 5, weak on day 4 = 5 Oct.
    // Dead after 5 × log2(45/10) = 5 × 2.17 = 10.85 days → day 14.85 = 15 Oct (20 hours past midnight).
    // Last review day 4 = 5 Oct, wrong. Silence 10.85 days → "11 days". Chain 10 → 5 → 10 → 5: final 5 ≤ first 10.
    // 2 of 3 reviews missed.
    const { report, payload } = buildDeadFact(
      "solid",
      [
        { day: 1, do: "wrong" },
        { day: 2, do: "right" },
        { day: 4, do: "wrong" },
      ],
      30
    )

    expect(generateCauseSentences(report, payload, UTC)).toEqual([
      "Missed answers kept cutting the half-life (10 → 5 → 10 → 5 days). It never grew long enough to survive a gap.",
      "Went weak on 5 Oct 2026.",
      "Died on 15 Oct 2026.",
      "Last reviewed on 5 Oct 2026 (you forgot it).",
      "You were silent for 11 days.",
      "You missed 2 of 3 reviews.",
    ])
  })

  it("one wrong answer among right ones: recovered, then weak again, then silence", () => {
    // Solid: 10. Right day 5 (70.7) → 20. Wrong day 10 (health 100 × 0.5^(5/20) = 84.1)
    // → health 45, half-life 10, weak. Right day 12 (45 × 0.5^(2/10) = 39.2, weak) → 100, half-life 20,
    // alive again, so the first weak spell does not count.
    // Weak after 20 × 0.737 = 14.74 days → day 26.74 = 27 Oct. Dead after 20 × 3.32 = 66.44 days
    // → day 78.44 = 18 Dec (day 61 = 1 Dec, +17). Last review day 12 = 13 Oct, right.
    // Silence 66.44 days → "66 days". Half-lives of silence 66.44 / 20 = 3.32 → "3.3".
    // Chain 10 → 20 → 10 → 20, grew. 1 of 3 missed.
    const { report, payload } = buildDeadFact(
      "solid",
      [
        { day: 5, do: "right" },
        { day: 10, do: "wrong" },
        { day: 12, do: "right" },
      ],
      100
    )

    expect(generateCauseSentences(report, payload, UTC)).toEqual([
      "The half-life grew to 20 days (10 → 20 → 10 → 20), then no review came for 66 days. That is about 3.3 half-lives of silence.",
      "Went weak on 27 Oct 2026.",
      "Died on 18 Dec 2026.",
      "Last reviewed on 13 Oct 2026 (you knew it).",
      "You were silent for 66 days.",
      "You missed 1 of 3 reviews.",
    ])
  })

  describe("a resurrected fact that died again", () => {
    // Shaky: half-life 5. First death after 5 × 3.32 = 16.61 days. Right answer on a grave on day 20
    // (21 Oct) brings it back with health 100 and the half-life it died with: 5.

    it("without halfLifeAtDeath and without reviews: no half-life is claimed", () => {
      // Second life from day 20, never reviewed.
      // Weak after 5 × 0.737 = 3.68 days → day 23.68 = 24 Oct. Dead after 16.61 days → day 36.61 = 6 Nov.
      // Silence since day 20: 16.61 days → "17 days". Came back once.
      const { report, payload } = buildDeadFact("shaky", [{ day: 20, do: "revive-right" }], 60)

      expect(generateCauseSentences(report, payload, UTC)).toEqual([
        "No review came for 17 days, and it faded away.",
        "Went weak on 24 Oct 2026.",
        "Died on 6 Nov 2026.",
        "Never reviewed after it came back.",
        "You were silent for 17 days.",
        "It had come back from the dead once.",
      ])
    })

    it("with halfLifeAtDeath and without reviews: says the half-life it faded with", () => {
      // Same life as above; the app passes the dead item's half-life, 5.
      const { report, payload, halfLifeAtDeath } = buildDeadFact(
        "shaky",
        [{ day: 20, do: "revive-right" }],
        60
      )
      expect(halfLifeAtDeath).toBe(5)

      expect(generateCauseSentences(report, payload, { ...UTC, halfLifeAtDeath })).toEqual([
        "It was never reviewed after it came back, so it faded with a half-life of 5 days.",
        "Went weak on 24 Oct 2026.",
        "Died on 6 Nov 2026.",
        "You were silent for 17 days.",
        "It had come back from the dead once.",
      ])
    })

    it("without halfLifeAtDeath but with a review: still no half-life is claimed", () => {
      // Back on day 20, right on day 22 (health 100 × 0.5^(2/5) = 75.8) → 100, half-life 10.
      // Weak after 10 × 0.737 = 7.37 days → day 29.37 = 30 Oct. Dead after 33.22 days → day 55.22 = 25 Nov
      // (day 31 = 1 Nov, +24). Last review day 22 = 23 Oct, right. Silence 33.22 days → "33 days".
      const { report, payload } = buildDeadFact(
        "shaky",
        [
          { day: 20, do: "revive-right" },
          { day: 22, do: "right" },
        ],
        80
      )

      expect(generateCauseSentences(report, payload, UTC)).toEqual([
        "No review came for 33 days, and it faded away.",
        "Went weak on 30 Oct 2026.",
        "Died on 25 Nov 2026.",
        "Last reviewed on 23 Oct 2026 (you knew it).",
        "You were silent for 33 days.",
        "You got your only review right.",
        "It had come back from the dead once.",
      ])
    })

    it("with halfLifeAtDeath and a review: counts the half-lives of silence", () => {
      // Same life as above. The half-life at death is 10 (5 doubled on day 22).
      // Half-lives of silence: 33.22 / 10 = 3.32 → "3.3".
      const { report, payload, halfLifeAtDeath } = buildDeadFact(
        "shaky",
        [
          { day: 20, do: "revive-right" },
          { day: 22, do: "right" },
        ],
        80
      )
      expect(halfLifeAtDeath).toBe(10)

      expect(generateCauseSentences(report, payload, { ...UTC, halfLifeAtDeath })).toEqual([
        "Its half-life was 10 days when the reviews stopped, and none came for 33 days. That is about 3.3 half-lives of silence.",
        "Went weak on 30 Oct 2026.",
        "Died on 25 Nov 2026.",
        "Last reviewed on 23 Oct 2026 (you knew it).",
        "You were silent for 33 days.",
        "You got your only review right.",
        "It had come back from the dead once.",
      ])
    })
  })

  it("a failed challenge on the grave is reported", () => {
    // New: half-life 2. Weak after 2 × 0.737 = 1.47 days → day 1.47 = 2 Oct.
    // Dead after 2 × 3.32 = 6.64 days → day 6.64 = 7 Oct. Silence 6.64 days → "7 days".
    // Wrong answer on the grave on day 10: it stays dead, 1 failed challenge.
    const { report, payload } = buildDeadFact("new", [{ day: 10, do: "revive-wrong" }], 12)

    expect(generateCauseSentences(report, payload, UTC)).toEqual([
      "It was never reviewed, so it faded with a half-life of 2 days.",
      "Went weak on 2 Oct 2026.",
      "Died on 7 Oct 2026.",
      "You were silent for 7 days.",
      "1 challenge to bring it back failed.",
    ])
  })
})

describe("halfLifeChain", () => {
  it("is just the first half-life for a fact never reviewed", () => {
    const { report, payload } = buildDeadFact("solid", [], 40)
    expect(halfLifeChain(report, payload)).toEqual([10])
  })

  it.each([
    ["new", 2, 20], // dead after 2 × 3.32 = 6.6 days
    ["shaky", 5, 40], // dead after 5 × 3.32 = 16.6 days
  ] as const)("starts from the knowledge level: %s gives %d", (knowledge, first, endDay) => {
    const { report, payload } = buildDeadFact(knowledge, [], endDay)
    expect(halfLifeChain(report, payload)).toEqual([first])
  })

  it("replays right answers by doubling: 10 → 20 → 40", () => {
    const { report, payload } = buildDeadFact(
      "solid",
      [
        { day: 5, do: "right" },
        { day: 15, do: "right" },
      ],
      150
    )
    expect(halfLifeChain(report, payload)).toEqual([10, 20, 40])
  })

  it("replays wrong answers by halving: 10 → 5 → 2.5 → 1.25", () => {
    const { report, payload } = buildDeadFact(
      "solid",
      [
        { day: 1, do: "wrong" },
        { day: 2, do: "wrong" },
        { day: 3, do: "wrong" },
      ],
      10
    )
    expect(halfLifeChain(report, payload)).toEqual([10, 5, 2.5, 1.25])
  })

  it("replays a mix in order: 10 → 20 → 10 → 20", () => {
    const { report, payload } = buildDeadFact(
      "solid",
      [
        { day: 5, do: "right" },
        { day: 10, do: "wrong" },
        { day: 12, do: "right" },
      ],
      100
    )
    expect(halfLifeChain(report, payload)).toEqual([10, 20, 10, 20])
  })

  it("stops doubling at 180: 10 → 20 → 40 → 80 → 160 → 180", () => {
    // Five right answers on days 1-5. Dead after 180 × 3.32 = 598 days, so day 800 is dead.
    const { report, payload } = buildDeadFact(
      "solid",
      [1, 2, 3, 4, 5].map((day) => ({ day, do: "right" as const })),
      800
    )
    expect(halfLifeChain(report, payload)).toEqual([10, 20, 40, 80, 160, 180])
  })

  it("stops halving at 1: 2 → 1 → 1 → 1", () => {
    // New: 2. Wrong on days 1, 2 and 3. Health just before each is 70.7, 22.5 and 22.5, all above 10.
    const { report, payload } = buildDeadFact(
      "new",
      [
        { day: 1, do: "wrong" },
        { day: 2, do: "wrong" },
        { day: 3, do: "wrong" },
      ],
      20
    )
    expect(halfLifeChain(report, payload)).toEqual([2, 1, 1, 1])
  })

  it("is null for a fact that has been resurrected", () => {
    const { report, payload } = buildDeadFact("shaky", [{ day: 20, do: "revive-right" }], 60)
    expect(report.timesResurrected).toBe(1)
    expect(halfLifeChain(report, payload)).toBeNull()
  })
})

describe("formatDuration", () => {
  it.each([
    [0, "less than a day"],
    [DAY / 2 - 1, "less than a day"],
    [DAY / 2, "1 day"], // whole days, rounded
    [DAY, "1 day"],
    [1.4 * DAY, "1 day"],
    [2 * DAY, "2 days"],
    [2.71 * DAY, "3 days"],
    [33.2193 * DAY, "33 days"],
    [132.877 * DAY, "133 days"],
  ])("%d ms is %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text)
  })
})
