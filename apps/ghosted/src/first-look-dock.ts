// The first look on the dock's own Play (task L6, Req 40.5, 40.8, design 17.1 and 17.3).
//
// The App has no frame scheduler of its own in the browser, and src/ may not
// call requestAnimationFrame (motion.test.ts). So the first look presses the
// shell TimeMachine's Play button (click(), which moves no focus) and reads
// each Play frame's offset as progress: offset / maxMs is elapsed time over
// TIME_MACHINE_PLAY_MS. The App turns progress into the plan's offset.
//
// While our Play runs, a user change or click inside the time machine (the
// slider, a jump, Play, a marker; not the ignored toggle) is a touch: Play is
// stopped, onTouch is called, and the onChange the same event then makes is
// dropped, so the offset goes back to today. The bubble handler ends the drop.
// The hook's own presses are ignored by its handlers.

import { useCallback, useEffect, useRef, type RefObject, type SyntheticEvent } from "react"

/** What the App gives the dock for the first look. */
export type FirstLookDockControl = {
  /** True while the first look plays. Turning true presses Play; turning false stops it. */
  active: boolean
  /** Each Play frame's progress, 0 to 1. 1 means Play has ended (or was stopped at its end). */
  onFrame: (progress: number) => void
  /** The user touched the slider, a jump, a marker or Play while the first look played. */
  onTouch: () => void
}

/** The shell's Play button (it reads Stop while playing). */
const PLAY_SELECTOR = ".shell-time-machine-controls .shell-button-primary"
const TIME_MACHINE_SELECTOR = ".shell-time-machine"

export type FirstLookDock = {
  /** The onChange for the TimeMachine and the markers. */
  change: (offsetMs: number) => void
  /** Ends a running first look first (for "Back to today", which is outside the time machine). */
  interrupt: () => void
  /** For the dock's root element. */
  handlers: {
    onClickCapture: (event: SyntheticEvent) => void
    onChangeCapture: (event: SyntheticEvent) => void
    onClick: () => void
    onChange: () => void
  }
}

export function useFirstLookDock(
  rootRef: RefObject<HTMLElement | null>,
  control: FirstLookDockControl | undefined,
  onChange: (offsetMs: number) => void,
  maxMs: number,
  ignoreSelector: string
): FirstLookDock {
  const running = useRef(false)
  const selfClick = useRef(false)
  const dropping = useRef(false)
  const ending = useRef(false)
  const latest = useRef(control)
  latest.current = control

  /** Clicks the shell's Play button: play when stopped, stop when playing. False when there is none. */
  const pressPlay = useCallback(() => {
    const button = rootRef.current?.querySelector<HTMLButtonElement>(PLAY_SELECTOR) ?? null
    if (button === null) return false
    selfClick.current = true
    try {
      button.click()
    } finally {
      selfClick.current = false
    }
    return true
  }, [rootRef])

  const active = control?.active === true
  useEffect(() => {
    if (active && !running.current) {
      ending.current = false
      running.current = pressPlay()
      // No Play button to drive it: end at once.
      if (!running.current) latest.current?.onFrame(1)
    } else if (!active && running.current) {
      running.current = false
      pressPlay()
    }
  }, [active, pressPlay])

  const change = useCallback(
    (offsetMs: number) => {
      if (dropping.current) return
      // A frame rounded up to the end can come before Play's own last frame,
      // which is also the end: both belong to the first look, not the user.
      if (ending.current && offsetMs >= maxMs) return
      if (running.current) {
        const progress = Math.min(1, Math.max(0, offsetMs / maxMs))
        if (progress >= 1) {
          running.current = false
          ending.current = true
        }
        latest.current?.onFrame(progress)
        return
      }
      onChange(offsetMs)
    },
    [onChange, maxMs]
  )

  const capture = useCallback(
    (event: SyntheticEvent) => {
      if (selfClick.current) return
      // Any user event ends the "Play's end" window, so a later "+1 year" jump works.
      ending.current = false
      if (!running.current) return
      const target = event.target
      if (!(target instanceof Element) || target.closest(TIME_MACHINE_SELECTOR) === null) return
      if (target.closest(ignoreSelector) !== null) return
      dropping.current = true
      running.current = false
      // The slider and the jumps stop Play themselves, a marker does not; Play itself is the touch.
      if (target.closest(PLAY_SELECTOR) === null) pressPlay()
      latest.current?.onTouch()
    },
    [ignoreSelector, pressPlay]
  )
  const release = useCallback(() => {
    if (!selfClick.current) dropping.current = false
  }, [])

  const interrupt = useCallback(() => {
    if (!running.current) return
    running.current = false
    pressPlay()
    latest.current?.onTouch()
  }, [pressPlay])

  return {
    change,
    interrupt,
    handlers: { onClickCapture: capture, onChangeCapture: capture, onClick: release, onChange: release },
  }
}
