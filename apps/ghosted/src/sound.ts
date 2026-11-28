// Optional sounds (haunt pass, Req 8). Copied from
// apps/study-dungeon/src/sound.ts (no import between apps, Req 21.1) with
// Ghosted's own setting key and recipes: a warm chime when a window is
// lit by a reach out, a rising arpeggio when a dark window is lit again, and
// a low thunk when a window goes dark in the time machine.
//
// Made in code with Web Audio oscillators: no audio files. Off by default;
// no audio context is made while it is off. play() never throws.
//

export type SoundKind = "lightOn" | "relight" | "lightOff"

export const SOUND_SETTING_KEY = "ghosted:sound"

type SettingStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function loadSoundEnabled(storage: SettingStorage | undefined): boolean {
  try {
    return storage?.getItem(SOUND_SETTING_KEY) === "on"
  } catch {
    return false
  }
}

export function saveSoundEnabled(storage: SettingStorage | undefined, enabled: boolean): boolean {
  try {
    storage?.setItem(SOUND_SETTING_KEY, enabled ? "on" : "off")
    return true
  } catch {
    return false
  }
}

export type Tone = {
  wave: "sine" | "triangle" | "sawtooth" | "square"
  fromHz: number
  toHz: number
  start: number
  duration: number
  peak: number
}

export const SOUND_RECIPES: Readonly<Record<SoundKind, readonly Tone[]>> = {
  // A soft two-note chime, like a lamp clicking on in a warm room: G5 then D6.
  lightOn: [
    { wave: "sine", fromHz: 783.99, toHz: 783.99, start: 0, duration: 0.35, peak: 0.14 },
    { wave: "triangle", fromHz: 1174.66, toHz: 1174.66, start: 0.09, duration: 0.45, peak: 0.1 },
  ],
  // A rising A minor to A major arpeggio: the boards come off and the light comes back.
  relight: [
    { wave: "sine", fromHz: 220, toHz: 440, start: 0, duration: 0.4, peak: 0.12 },
    { wave: "sine", fromHz: 554.37, toHz: 554.37, start: 0.18, duration: 0.45, peak: 0.13 },
    { wave: "sine", fromHz: 659.25, toHz: 659.25, start: 0.3, duration: 0.45, peak: 0.13 },
    { wave: "triangle", fromHz: 880, toHz: 880, start: 0.42, duration: 0.7, peak: 0.12 },
  ],
  // A low thunk that sinks, like a switch thrown in an empty house.
  lightOff: [
    { wave: "square", fromHz: 140, toHz: 60, start: 0, duration: 0.25, peak: 0.09 },
    { wave: "sine", fromHz: 90, toHz: 40, start: 0, duration: 0.5, peak: 0.16 },
  ],
}

const SILENT = 0.0001

export type AudioParamLike = {
  setValueAtTime(value: number, time: number): unknown
  linearRampToValueAtTime(value: number, time: number): unknown
  exponentialRampToValueAtTime(value: number, time: number): unknown
}
export type AudioNodeLike = { connect(destination: unknown): unknown }
export type OscillatorLike = AudioNodeLike & {
  type: string
  frequency: AudioParamLike
  start(time: number): void
  stop(time: number): void
}
export type GainLike = AudioNodeLike & { gain: AudioParamLike }
export type AudioContextLike = {
  readonly currentTime: number
  readonly destination: unknown
  readonly state?: string
  resume?(): Promise<void> | void
  createOscillator(): OscillatorLike
  createGain(): GainLike
}

export type SoundPlayer = { play(kind: SoundKind): void }

function browserContext(): AudioContextLike | null {
  const g = globalThis as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike }
  const Ctor = g.AudioContext ?? g.webkitAudioContext
  return Ctor === undefined ? null : new Ctor()
}

export function createSoundPlayer({
  isEnabled,
  createContext = browserContext,
}: {
  isEnabled: () => boolean
  createContext?: () => AudioContextLike | null
}): SoundPlayer {
  let context: AudioContextLike | null = null
  let unavailable = false
  const getContext = () => {
    if (context !== null || unavailable) return context
    try {
      context = createContext()
    } catch {
      context = null
    }
    if (context === null) unavailable = true
    return context
  }
  return {
    play(kind) {
      if (!isEnabled()) return
      const ctx = getContext()
      if (ctx === null) return
      try {
        if (ctx.state === "suspended") void ctx.resume?.()
        for (const tone of SOUND_RECIPES[kind]) playTone(ctx, tone, ctx.currentTime)
      } catch {
        // A sound must never break the street.
      }
    },
  }
}

function playTone(ctx: AudioContextLike, tone: Tone, t0: number) {
  const start = t0 + tone.start
  const end = start + tone.duration
  const osc = ctx.createOscillator()
  osc.type = tone.wave
  osc.frequency.setValueAtTime(tone.fromHz, start)
  if (tone.toHz !== tone.fromHz) osc.frequency.exponentialRampToValueAtTime(tone.toHz, end)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(SILENT, start)
  gain.gain.linearRampToValueAtTime(tone.peak, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(SILENT, end)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(end + 0.02)
}

/** A short buzz on phones that support it; ignored everywhere else. */
export function buzz(pattern: number | number[]): void {
  try {
    const nav = globalThis.navigator as { vibrate?: (p: number | number[]) => boolean } | undefined
    nav?.vibrate?.(pattern)
  } catch {
    // Never mind.
  }
}
