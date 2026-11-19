// Shared helpers for the round 7 tests: an adapter whose saves can be made to
// fail, the live region's text, and a fake Web Audio context that records the
// tones the real sound player makes. Never the real clock, never real audio.

import { InMemoryAdapter, type StoredSnapshot } from "@decay-engine/engine"
import { ANNOUNCER_ID } from "../App"
import { SOUND_RECIPES, type AudioContextLike, type AudioParamLike, type OscillatorLike, type SoundKind } from "../sound"

/** An InMemoryAdapter whose saves throw `failWith` while it is set; counts saves that went through. */
export class FailingAdapter extends InMemoryAdapter {
  failWith: unknown = null
  saves = 0
  override save(snapshot: StoredSnapshot): void {
    if (this.failWith !== null) throw this.failWith
    this.saves++
    super.save(snapshot)
  }
}

/** What a browser throws when localStorage is full. */
export const quotaError = () => new DOMException("The quota has been exceeded.", "QuotaExceededError")

/** The App's polite live region. */
export function announcer(): HTMLElement {
  const el = document.getElementById(ANNOUNCER_ID)
  if (el === null) throw new Error("test bug: the live region is not on the page")
  return el
}

/** The live region's current words. */
export const announced = () => announcer().textContent ?? ""

/** One tone a sound started: its wave and starting pitch. */
export type ToneRecord = { wave: string; fromHz: number }

/** The tones one sound of this kind makes, as the recorder sees them. */
export const tonesOf = (kind: SoundKind): ToneRecord[] =>
  SOUND_RECIPES[kind].map((tone) => ({ wave: tone.wave, fromHz: tone.fromHz }))

/** A fake AudioContext factory that records every tone started. */
export function fakeAudio() {
  const tones: ToneRecord[] = []
  let contexts = 0
  const param = (onSet?: (value: number) => void): AudioParamLike => ({
    setValueAtTime(value: number) {
      onSet?.(value)
    },
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  })
  const create = (): AudioContextLike => {
    contexts++
    return {
      currentTime: 0,
      destination: {},
      createOscillator(): OscillatorLike {
        let fromHz = Number.NaN
        const osc: OscillatorLike = {
          type: "",
          frequency: param((value) => {
            if (Number.isNaN(fromHz)) fromHz = value
          }),
          connect() {},
          start() {
            tones.push({ wave: osc.type, fromHz })
          },
          stop() {},
        }
        return osc
      },
      createGain() {
        return { gain: param(), connect() {} }
      },
    }
  }
  return { create, tones, contexts: () => contexts }
}
