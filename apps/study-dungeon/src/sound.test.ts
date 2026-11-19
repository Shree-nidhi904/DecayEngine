// Tests for the optional sound effects (task 20.3, Requirement 18).
// A fake audio context records every call, so the tests check what would be
// played without a sound card or a real clock.
//
// Written by Claude Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { describe, expect, it, vi } from "vitest"
import {
  SOUND_RECIPES,
  SOUND_SETTING_KEY,
  createSoundPlayer,
  loadSoundEnabled,
  saveSoundEnabled,
  type AudioContextLike,
  type SoundKind,
} from "./sound"

type Call = [method: string, value: number, time: number]

/** Records each oscillator: its wave, frequency calls, start/stop, and its gain calls. */
function fakeContext(currentTime = 10, state = "running") {
  const oscillators: Array<{ type: string; freq: Call[]; gain: Call[]; start?: number; stop?: number; routedToOut: boolean }> = []
  const destination = { name: "speakers" }
  const resume = vi.fn()
  const param = (log: Call[]) => ({
    setValueAtTime: (v: number, t: number) => log.push(["set", v, t]),
    linearRampToValueAtTime: (v: number, t: number) => log.push(["linear", v, t]),
    exponentialRampToValueAtTime: (v: number, t: number) => log.push(["exp", v, t]),
  })
  const ctx: AudioContextLike = {
    currentTime,
    destination,
    state,
    resume,
    createOscillator() {
      const rec = { type: "", freq: [] as Call[], gain: [] as Call[], routedToOut: false } as (typeof oscillators)[number]
      oscillators.push(rec)
      const osc = {
        get type() {
          return rec.type
        },
        set type(v: string) {
          rec.type = v
        },
        frequency: param(rec.freq),
        connect(target: unknown) {
          ;(target as { __attach?: (r: typeof rec) => void }).__attach?.(rec)
          return target
        },
        start: (t: number) => {
          rec.start = t
        },
        stop: (t: number) => {
          rec.stop = t
        },
      }
      return osc
    },
    createGain() {
      let owner: (typeof oscillators)[number] | null = null
      const pending: Call[] = []
      return {
        // Gain calls are made before the oscillator connects; keep them and hand them over.
        gain: param(pending),
        __attach(rec: (typeof oscillators)[number]) {
          owner = rec
          rec.gain.push(...pending)
        },
        connect(target: unknown) {
          if (target === destination && owner) owner.routedToOut = true
          return target
        },
      } as unknown as ReturnType<AudioContextLike["createGain"]>
    },
  }
  return { ctx, oscillators, resume }
}

const on = () => true
const off = () => false

describe("createSoundPlayer", () => {
  it("does nothing at all while sound is off: no audio context is even created", () => {
    const createContext = vi.fn(() => fakeContext().ctx)
    const player = createSoundPlayer({ isEnabled: off, createContext })
    for (const kind of ["right", "wrong", "revive"] as SoundKind[]) player.play(kind)
    expect(createContext).not.toHaveBeenCalled()
  })

  it("creates the context once, on the first sound, and reuses it", () => {
    const fake = fakeContext()
    const createContext = vi.fn(() => fake.ctx)
    const player = createSoundPlayer({ isEnabled: on, createContext })
    player.play("right")
    player.play("wrong")
    player.play("revive")
    expect(createContext).toHaveBeenCalledTimes(1)
    expect(fake.oscillators).toHaveLength(2 + 2 + 4)
  })

  it("follows the toggle on every play", () => {
    const fake = fakeContext()
    let enabled = false
    const player = createSoundPlayer({ isEnabled: () => enabled, createContext: () => fake.ctx })
    player.play("right")
    expect(fake.oscillators).toHaveLength(0)
    enabled = true
    player.play("right")
    expect(fake.oscillators).toHaveLength(2)
    enabled = false
    player.play("right")
    expect(fake.oscillators).toHaveLength(2)
  })

  for (const kind of ["right", "wrong", "revive"] as SoundKind[]) {
    it(`plays the "${kind}" recipe: each tone's wave, pitch, timing and fade`, () => {
      const fake = fakeContext(10)
      createSoundPlayer({ isEnabled: on, createContext: () => fake.ctx }).play(kind)
      const recipe = SOUND_RECIPES[kind]
      expect(fake.oscillators).toHaveLength(recipe.length)
      recipe.forEach((tone, i) => {
        const osc = fake.oscillators[i]!
        const start = 10 + tone.start
        const end = start + tone.duration
        expect(osc.type).toBe(tone.wave)
        expect(osc.freq[0]).toEqual(["set", tone.fromHz, start])
        if (tone.toHz !== tone.fromHz) expect(osc.freq[1]).toEqual(["exp", tone.toHz, end])
        else expect(osc.freq).toHaveLength(1)
        // Fades in to its peak in 10 ms, then out to near silence by the end.
        expect(osc.gain[0]).toEqual(["set", 0.0001, start])
        expect(osc.gain[1]![0]).toBe("linear")
        expect(osc.gain[1]![1]).toBe(tone.peak)
        expect(osc.gain[1]![2]).toBeCloseTo(start + 0.01, 10)
        expect(osc.gain[2]).toEqual(["exp", 0.0001, end])
        expect(osc.start).toBe(start)
        expect(osc.stop).toBeCloseTo(end + 0.02, 10)
        expect(osc.routedToOut).toBe(true)
      })
    })
  }

  it("keeps the three sounds distinct: a high slash, a low growl, a rising chime", () => {
    const pitches = (k: SoundKind) => SOUND_RECIPES[k].flatMap((t) => [t.fromHz, t.toHz])
    expect(Math.min(...pitches("right"))).toBeGreaterThanOrEqual(400)
    expect(Math.max(...pitches("wrong"))).toBeLessThan(200)
    const chime = SOUND_RECIPES.revive
    for (let i = 1; i < chime.length; i++) {
      expect(chime[i]!.fromHz).toBeGreaterThan(chime[i - 1]!.fromHz)
      expect(chime[i]!.start).toBeGreaterThan(chime[i - 1]!.start)
    }
    // Quiet enough to sit under the interface.
    for (const k of ["right", "wrong", "revive"] as SoundKind[]) {
      for (const t of SOUND_RECIPES[k]) expect(t.peak).toBeLessThanOrEqual(0.25)
    }
  })

  it("wakes a suspended context before playing", () => {
    const fake = fakeContext(0, "suspended")
    createSoundPlayer({ isEnabled: on, createContext: () => fake.ctx }).play("right")
    expect(fake.resume).toHaveBeenCalledTimes(1)
  })

  it("stays silent and does not throw without Web Audio, and stops asking for it", () => {
    const createContext = vi.fn(() => null)
    const player = createSoundPlayer({ isEnabled: on, createContext })
    expect(() => {
      player.play("right")
      player.play("wrong")
    }).not.toThrow()
    expect(createContext).toHaveBeenCalledTimes(1)
  })

  it("never lets an audio error escape into a fight", () => {
    const broken = vi.fn((): AudioContextLike => {
      throw new Error("no audio device")
    })
    expect(() => createSoundPlayer({ isEnabled: on, createContext: broken }).play("right")).not.toThrow()
    const fake = fakeContext()
    fake.ctx.createOscillator = () => {
      throw new Error("device lost")
    }
    expect(() => createSoundPlayer({ isEnabled: on, createContext: () => fake.ctx }).play("revive")).not.toThrow()
  })
})

describe("the sound setting", () => {
  const memory = () => {
    const data = new Map<string, string>()
    return {
      data,
      getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
      setItem: (k: string, v: string) => void data.set(k, v),
    }
  }

  it("is off by default (Requirement 18.1)", () => {
    expect(loadSoundEnabled(memory())).toBe(false)
  })

  it("is saved under its own key and read back", () => {
    const s = memory()
    saveSoundEnabled(s, true)
    expect(s.data.get(SOUND_SETTING_KEY)).toBe("on")
    expect(loadSoundEnabled(s)).toBe(true)
    saveSoundEnabled(s, false)
    expect(s.data.get(SOUND_SETTING_KEY)).toBe("off")
    expect(loadSoundEnabled(s)).toBe(false)
  })

  it("treats anything but 'on' as off", () => {
    const s = memory()
    s.data.set(SOUND_SETTING_KEY, "true")
    expect(loadSoundEnabled(s)).toBe(false)
  })

  it("survives storage that throws, reading as off and ignoring the save", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("full")
      },
    }
    expect(loadSoundEnabled(throwing)).toBe(false)
    expect(() => saveSoundEnabled(throwing, true)).not.toThrow()
  })
})
