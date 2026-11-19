// Hunter ranks from souls banished.
// Written by Claude Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { describe, expect, it } from "vitest"
import { RANKS, rankOf } from "./ranks"

describe("rankOf", () => {
  it("starts as Candle Bearer, 10 souls from the next rank", () => {
    expect(rankOf(0)).toEqual({ rank: RANKS[0], next: RANKS[1], progress: 0, toNext: 10 })
  })

  it("moves up exactly at each threshold and shows the way to the next", () => {
    expect(rankOf(9).rank.title).toBe("Candle Bearer")
    expect(rankOf(10).rank.title).toBe("Apprentice Exorcist")
    expect(rankOf(15)).toMatchObject({ progress: 5 / 15, toNext: 10 })
    expect(rankOf(25).rank.title).toBe("Monster Hunter")
  })

  it("tops out at the last rank", () => {
    expect(rankOf(1000)).toMatchObject({ rank: RANKS[RANKS.length - 1], next: null, progress: 1, toNext: 0 })
  })
})
