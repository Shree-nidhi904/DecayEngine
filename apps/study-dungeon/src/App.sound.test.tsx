// @vitest-environment jsdom
//
// Sound through the App (task 20, Requirement 18): the switch next to "Reset
// all data" is off by default and its choice is saved under
// "study-dungeon:sound"; the App's one real sound player plays "right",
// "wrong" and "revive" from the dialogs, and nothing while sound is off.
//
// The player is the real createSoundPlayer; only its Web Audio context is a
// fake that records each tone started (round7-helpers.ts). A real
// DecayEngine on InMemoryAdapter, fixed times, the in-memory storage.
//
// Facts at day 10 (health 100 × 0.5^(days / half-life); weak below 60, dead below 10):
//   w1  solid, added day 0  → 100 × 0.5^1 = 50, weak
//   w2  shaky, added day 6  → 100 × 0.5^(4/5) ≈ 57.4, weak (after w1: weakest first)
//   d   new, added day 0    → 100 × 0.5^5 ≈ 3.1, dead

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, screen, within } from "@testing-library/react"
import { MemoryStorage, makeAppKit } from "./test/app-kit"
import { day } from "./test/fixtures"
import { fakeAudio, tonesOf } from "./test/round7-helpers"
import { SOUND_SETTING_KEY } from "./sound"
import { STARTED_FLAG } from "./first-run"

afterEach(cleanup)

const button = (name: string) => screen.getByRole("button", { name })
const soundSwitch = () => screen.getByRole("switch", { name: "Sound effects" }) as HTMLInputElement
const tab = (list: string) => screen.getByRole("tab", { name: new RegExp(`^${list}`) })
const cardButton = (name: string) =>
  within(screen.getByRole("tabpanel")).getAllByRole("button").find((b) => b.textContent === name)!

function setup(stored: Record<string, string> = {}) {
  const audio = fakeAudio()
  const kit = makeAppKit(new MemoryStorage({ [STARTED_FLAG]: "1", ...stored }), { createAudioContext: audio.create })
  kit.add("w1", "solid", day(0))
  kit.add("w2", "shaky", day(6))
  kit.add("d", "new", day(0))
  kit.renderApp(day(10))
  return { kit, audio }
}

/** Fights the first fact in the Dungeon and answers. */
function fightFirstMonster(correct: boolean) {
  fireEvent.click(tab("Dungeon"))
  fireEvent.click(cardButton("Fight"))
  fireEvent.click(button("Show answer"))
  fireEvent.click(button(correct ? "I knew it" : "I forgot"))
  fireEvent.click(button("Close"))
}

describe("the sound switch", () => {
  it("is off by default, sits in the settings area beside Reset all data, and saves nothing until used", () => {
    const { kit } = setup()
    expect(soundSwitch().checked).toBe(false)
    const settings = button("Reset all data").parentElement!
    expect(settings.contains(soundSwitch())).toBe(true)
    expect(kit.storage.entries()[SOUND_SETTING_KEY]).toBeUndefined()
  })

  it("turning it on saves on; turning it off saves off", () => {
    const { kit } = setup()
    fireEvent.click(soundSwitch())
    expect(soundSwitch().checked).toBe(true)
    expect(kit.storage.entries()[SOUND_SETTING_KEY]).toBe("on")
    fireEvent.click(soundSwitch())
    expect(soundSwitch().checked).toBe(false)
    expect(kit.storage.entries()[SOUND_SETTING_KEY]).toBe("off")
  })

  it("starts on when on was saved", () => {
    setup({ [SOUND_SETTING_KEY]: "on" })
    expect(soundSwitch().checked).toBe(true)
  })
})

describe("sounds from the dialogs", () => {
  it("nothing plays while sound is off: no audio context is even made", () => {
    const { audio } = setup()
    fightFirstMonster(true)
    fightFirstMonster(false)
    expect(audio.contexts()).toBe(0)
    expect(audio.tones).toEqual([])
  })

  it("with sound on, a right answer plays right and a wrong one plays wrong, through one player", () => {
    const { audio } = setup()
    fireEvent.click(soundSwitch())

    fightFirstMonster(true) // w1 (50): right, back to the Crypt
    expect(audio.tones).toEqual(tonesOf("right"))

    fightFirstMonster(false) // w2 (57.4), now the only monster: wrong
    expect(audio.tones).toEqual([...tonesOf("right"), ...tonesOf("wrong")])
    // One player, one audio context for the whole visit.
    expect(audio.contexts()).toBe(1)
  })

  it("a won challenge plays revive; a lost one plays wrong", () => {
    const { audio } = setup({ [SOUND_SETTING_KEY]: "on" })
    fireEvent.click(tab("Graveyard"))

    fireEvent.click(cardButton("Challenge"))
    fireEvent.click(button("I forgot"))
    expect(audio.tones).toEqual(tonesOf("wrong"))
    fireEvent.click(button("Close"))

    fireEvent.click(cardButton("Challenge"))
    fireEvent.click(button("I knew it"))
    expect(audio.tones).toEqual([...tonesOf("wrong"), ...tonesOf("revive")])
  })

  it("turning sound off mid-visit silences the same player at once", () => {
    const { audio } = setup({ [SOUND_SETTING_KEY]: "on" })
    fightFirstMonster(true)
    expect(audio.tones).toEqual(tonesOf("right"))
    fireEvent.click(soundSwitch())
    fightFirstMonster(false)
    expect(audio.tones).toEqual(tonesOf("right"))
  })

  it("walking away plays nothing", () => {
    const { audio } = setup({ [SOUND_SETTING_KEY]: "on" })
    fireEvent.click(cardButton("Fight"))
    fireEvent.click(button("Show answer"))
    fireEvent.click(button("Walk away"))
    expect(audio.tones).toEqual([])
  })
})
