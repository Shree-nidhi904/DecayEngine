import { describe, expect, it } from "vitest"
import { createSoundPlayer, loadSoundEnabled, saveSoundEnabled, SOUND_RECIPES, SOUND_SETTING_KEY, type AudioContextLike } from "./sound"

function fakeContext() {
  const started: { type: string; at: number }[] = []
  const param = () => ({ setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} })
  const ctx: AudioContextLike = {
    currentTime: 10,
    destination: {},
    createOscillator: () => {
      const osc = {
        type: "",
        frequency: param(),
        connect: () => {},
        start: (at: number) => started.push({ type: osc.type, at }),
        stop: () => {},
      }
      return osc
    },
    createGain: () => ({ gain: param(), connect: () => {} }),
  }
  return { ctx, started }
}

describe("Ghosted sound (Req 8)", () => {
  it("is off by default and keeps the choice under ghosted:sound", () => {
    const map = new Map<string, string>()
    const s = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) }
    expect(loadSoundEnabled(s)).toBe(false)
    expect(saveSoundEnabled(s, true)).toBe(true)
    expect(map.get(SOUND_SETTING_KEY)).toBe("on")
    expect(loadSoundEnabled(s)).toBe(true)
  })

  it("makes no audio context while off", () => {
    let made = 0
    const player = createSoundPlayer({ isEnabled: () => false, createContext: () => (made++, fakeContext().ctx) })
    player.play("lightOn")
    player.play("relight")
    expect(made).toBe(0)
  })

  it("plays every tone of a recipe once when on, from the context's time", () => {
    const { ctx, started } = fakeContext()
    const player = createSoundPlayer({ isEnabled: () => true, createContext: () => ctx })
    player.play("relight")
    expect(started).toHaveLength(SOUND_RECIPES.relight.length)
    expect(started.map((s) => s.at)).toEqual(SOUND_RECIPES.relight.map((t) => 10 + t.start))
  })

  it("the three sounds differ", () => {
    const sig = (k: keyof typeof SOUND_RECIPES) => JSON.stringify(SOUND_RECIPES[k])
    expect(new Set([sig("lightOn"), sig("relight"), sig("lightOff")]).size).toBe(3)
  })

  it("a browser without Web Audio plays nothing and does not throw", () => {
    const player = createSoundPlayer({ isEnabled: () => true, createContext: () => null })
    expect(() => player.play("lightOff")).not.toThrow()
  })
})
