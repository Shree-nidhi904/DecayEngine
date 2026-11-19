// Optional sound effects (task 20, Requirement 18): a slash for a right
// answer, a growl for a wrong one and a chime for a resurrection.
//
// The sounds are generated in code with the Web Audio API, so there are no
// audio files and no licences to track (Requirement 18.2 asks for original or
// CC0 audio: these are original). Sound is off by default (18.1), and the
// choice is kept in localStorage under SOUND_SETTING_KEY.
//
// play() never throws and does nothing when sound is off or the browser has
// no Web Audio. The audio context is created on the first sound, which is
// always inside a click, as browsers require.
//
// Written by Claude Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

export type SoundKind = "right" | "wrong" | "revive"

export const SOUND_SETTING_KEY = "study-dungeon:sound"

type SettingStorage = Pick<Storage, "getItem" | "setItem">

function browserStorage(): SettingStorage | undefined {
  try {
    return globalThis.localStorage ?? undefined
  } catch {
    return undefined
  }
}

/** Whether sound is on. Off unless the user turned it on; off if storage cannot be read. */
export function loadSoundEnabled(storage: SettingStorage | undefined = browserStorage()): boolean {
  try {
    return storage?.getItem(SOUND_SETTING_KEY) === "on"
  } catch {
    return false
  }
}

/** Saves the choice. A preference is not worth an error: failures are ignored. */
export function saveSoundEnabled(storage: SettingStorage | undefined, enabled: boolean): void {
  try {
    storage?.setItem(SOUND_SETTING_KEY, enabled ? "on" : "off")
  } catch {
    // Storage full or blocked: the toggle still works for this visit.
  }
}

/** One tone: a wave sliding from one pitch to another, with a short fade in and out. */
export type Tone = {
  wave: "sine" | "triangle" | "sawtooth" | "square"
  fromHz: number
  toHz: number
  /** Seconds after the sound starts. */
  start: number
  /** Seconds. */
  duration: number
  /** Peak volume, 0-1. Kept low: these sit under the interface, not over it. */
  peak: number
}

export const SOUND_RECIPES: Readonly<Record<SoundKind, readonly Tone[]>> = {
  // A quick bright downward sweep: a blade through the air.
  right: [
    { wave: "triangle", fromHz: 1400, toHz: 500, start: 0, duration: 0.12, peak: 0.22 },
    { wave: "sine", fromHz: 2600, toHz: 1800, start: 0, duration: 0.06, peak: 0.08 },
  ],
  // A low rough growl that sinks.
  wrong: [
    { wave: "sawtooth", fromHz: 110, toHz: 70, start: 0, duration: 0.45, peak: 0.16 },
    { wave: "square", fromHz: 55, toHz: 45, start: 0, duration: 0.45, peak: 0.08 },
  ],
  // A rising C major chime: C5, E5, G5, C6.
  revive: [
    { wave: "sine", fromHz: 523.25, toHz: 523.25, start: 0, duration: 0.5, peak: 0.16 },
    { wave: "sine", fromHz: 659.25, toHz: 659.25, start: 0.12, duration: 0.5, peak: 0.16 },
    { wave: "sine", fromHz: 783.99, toHz: 783.99, start: 0.24, duration: 0.5, peak: 0.16 },
    { wave: "sine", fromHz: 1046.5, toHz: 1046.5, start: 0.36, duration: 0.6, peak: 0.14 },
  ],
}

/** Silence for exponential ramps, which cannot reach 0. */
const SILENT = 0.0001

/** The parts of Web Audio this file uses, so tests can pass a fake. */
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

export type SoundPlayerOptions = {
  /** Read on every play, so the toggle takes effect at once. */
  isEnabled: () => boolean
  /** Makes the audio context. Defaults to the browser's AudioContext; null when there is none. */
  createContext?: () => AudioContextLike | null
}

export type SoundPlayer = { play(kind: SoundKind): void }

function browserContext(): AudioContextLike | null {
  const g = globalThis as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike }
  const Ctor = g.AudioContext ?? g.webkitAudioContext
  return Ctor === undefined ? null : new Ctor()
}

export function createSoundPlayer({ isEnabled, createContext = browserContext }: SoundPlayerOptions): SoundPlayer {
  let context: AudioContextLike | null = null
  let unavailable = false

  function getContext(): AudioContextLike | null {
    if (context !== null || unavailable) return context
    try {
      context = createContext()
    } catch {
      context = null
    }
    // Do not keep trying on every click when the browser cannot make one.
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
        const t0 = ctx.currentTime
        for (const tone of SOUND_RECIPES[kind]) playTone(ctx, tone, t0)
      } catch {
        // A sound effect must never break a fight.
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
