// @vitest-environment jsdom
//
// The fight and the challenge with an injected sound player (task 20.2) and
// write-error handler (task 18.3). The player is a fake that records which
// sound was asked for. A real DecayEngine on InMemoryAdapter, fixed times.
//
// Facts (policy spec: health 100 × 0.5^(days / half-life); solid 10 days, new 2;
// dead below 10):
//   s  solid, added day 0: alive on day 1 (≈ 93.3), dead on day 34 (≈ 9.5)
//   d  new, added day 0: dead on day 10 (≈ 3.1)

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DecayEngine } from "@decay-engine/engine"
import { FightDialog } from "./FightDialog"
import { ChallengeDialog } from "./ChallengeDialog"
import type { SoundKind, SoundPlayer } from "../sound"
import { studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "../policy"
import { day, makeEngine } from "../test/fixtures"
import { FailingAdapter, quotaError } from "../test/round7-helpers"
import { fightText } from "../wording"

afterEach(cleanup)

function fakePlayer() {
  const played: SoundKind[] = []
  const player: SoundPlayer = { play: (kind) => void played.push(kind) }
  return { player, played }
}

const button = (name: string) => screen.getByRole("button", { name })

describe("FightDialog sounds", () => {
  function renderFight(at: number, sound: SoundPlayer, onResult = vi.fn()) {
    const { engine, add, viewOf } = makeEngine()
    add("s", "solid", day(0))
    render(
      <FightDialog
        engine={engine}
        now={() => at}
        fact={viewOf("s", day(1))}
        onWrite={() => {}}
        onClose={() => {}}
        sound={sound}
        onResult={onResult}
      />
    )
    return { onResult }
  }

  it("a right answer plays right, once", () => {
    const { player, played } = fakePlayer()
    const { onResult } = renderFight(day(1), player)
    fireEvent.click(button("Show answer"))
    fireEvent.click(button("I knew it"))
    expect(played).toEqual(["right"])
    expect(onResult.mock.calls).toEqual([["correct"]])
  })

  it("a wrong answer plays wrong, once", () => {
    const { player, played } = fakePlayer()
    const { onResult } = renderFight(day(1), player)
    fireEvent.click(button("Show answer"))
    fireEvent.click(button("I forgot"))
    expect(played).toEqual(["wrong"])
    expect(onResult.mock.calls).toEqual([["incorrect"]])
  })

  it("walking away plays nothing", () => {
    const { player, played } = fakePlayer()
    renderFight(day(1), player)
    fireEvent.click(button("Show answer"))
    fireEvent.click(button("Walk away"))
    expect(played).toEqual([])
  })

  it("a fact that died before the answer plays nothing and reports died", () => {
    // Opened on day 1, answered on day 34: 100 × 0.5^3.4 ≈ 9.5, dead.
    const { player, played } = fakePlayer()
    const { onResult } = renderFight(day(34), player)
    fireEvent.click(button("Show answer"))
    fireEvent.click(button("I knew it"))
    expect(played).toEqual([])
    expect(onResult.mock.calls).toEqual([["died"]])
    expect(screen.getByRole("status").textContent).toBe(fightText.diedFirst)
  })

  it("a storage problem goes to onWriteError: no sound, no result, nothing written", () => {
    const adapter = new FailingAdapter()
    let n = 0
    const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(studyDungeonPolicy, adapter, () => `f${n++}`)
    const id = engine.addItem(
      { payload: { question: "Q", answer: "A", why: "", knowledge: "solid" }, importance: 2, costMinutes: 2 },
      day(0)
    )
    const fact = engine.view(day(1)).find((f) => f.id === id)!
    adapter.failWith = quotaError()
    const { player, played } = fakePlayer()
    const onWrite = vi.fn()
    const onResult = vi.fn()
    const errors: unknown[] = []
    render(
      <FightDialog
        engine={engine}
        now={() => day(1)}
        fact={fact}
        onWrite={onWrite}
        onClose={() => {}}
        sound={player}
        onResult={onResult}
        onWriteError={(error) => {
          errors.push(error)
          return true
        }}
      />
    )
    fireEvent.click(button("Show answer"))
    fireEvent.click(button("I knew it"))

    expect(errors).toHaveLength(1)
    expect((errors[0] as DOMException).name).toBe("QuotaExceededError")
    expect(played).toEqual([])
    expect(onWrite).not.toHaveBeenCalled()
    expect(onResult).not.toHaveBeenCalled()
    expect(screen.getByRole("status").textContent).toBe("")
    expect(engine.history(id).map((e) => e.type)).toEqual(["created"])
  })
})

describe("ChallengeDialog sounds", () => {
  function renderChallenge(sound: SoundPlayer, onResult = vi.fn()) {
    const { engine, add, viewOf } = makeEngine()
    add("d", "new", day(0))
    render(
      <ChallengeDialog
        engine={engine}
        now={() => day(10)}
        fact={viewOf("d", day(10))}
        onWrite={() => {}}
        onClose={() => {}}
        sound={sound}
        onResult={onResult}
      />
    )
    return { onResult }
  }

  it("a won challenge plays revive, once", () => {
    const { player, played } = fakePlayer()
    const { onResult } = renderChallenge(player)
    fireEvent.click(button("I knew it"))
    expect(played).toEqual(["revive"])
    // Resurrect keeps the half-life at death: "new" never reviewed, 2 days.
    expect(onResult.mock.calls).toEqual([[{ ok: true, halfLifeDays: 2 }]])
  })

  it("a lost challenge plays wrong, once", () => {
    const { player, played } = fakePlayer()
    const { onResult } = renderChallenge(player)
    fireEvent.click(button("I forgot"))
    expect(played).toEqual(["wrong"])
    expect(onResult.mock.calls).toEqual([[{ ok: false, reason: "You got it wrong. The fact stays dead." }]])
  })

  it("walking away plays nothing", () => {
    const { player, played } = fakePlayer()
    renderChallenge(player)
    fireEvent.click(button("Walk away"))
    expect(played).toEqual([])
  })
})
