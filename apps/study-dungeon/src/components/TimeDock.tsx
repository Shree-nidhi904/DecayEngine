// The time dock (visual pass, Pass 3): the shell's TimeMachine in a dock
// fixed to the bottom of the screen, beside a candle that melts as you look
// further ahead. Under the slider: markers for the days a fact weakens or
// dies (click one to jump there) and a "Next:" line.
// Reads only: today's facts and the engine's forecast.
//
// Written by - Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { useMemo, useState } from "react"
import { TimeMachine, TIME_MACHINE_MAX_DAYS, type FrameScheduler } from "@decay-engine/shell"
import type { StudyDungeonEngine } from "../engine-instance"
import { DAY_MS } from "../policy"
import { studyDungeonShellTheme } from "../theme"
import { timelineEvents, upcoming } from "../timeline"
import { studyDungeonWording, timelineText } from "../wording"
import { Candle, StateGlyph } from "./art/Scenery"

export interface TimeDockProps {
  engine: Pick<StudyDungeonEngine, "view" | "forecast">
  realNow: number
  offsetMs: number
  onChange: (offsetMs: number) => void
  formatDate: (ms: number) => string
  /** Bumped after every write, so the timeline is read again. */
  version: number
  frames?: FrameScheduler
  clock?: () => number
  prefersReducedMotion?: () => boolean
}

export function TimeDock({
  engine,
  realNow,
  offsetMs,
  onChange,
  formatDate,
  version,
  frames,
  clock,
  prefersReducedMotion,
}: TimeDockProps) {
  const events = useMemo(
    () =>
      timelineEvents(engine.view(realNow), engine.forecast(realNow, TIME_MACHINE_MAX_DAYS * DAY_MS), realNow, TIME_MACHINE_MAX_DAYS),
    [engine, realNow, version]
  )
  // On phones the dock starts folded to one row (CSS); this opens it.
  const [open, setOpen] = useState(false)
  const shownDay = Math.floor(offsetMs / DAY_MS)
  const next = upcoming(events, shownDay)
  const age = offsetMs / (TIME_MACHINE_MAX_DAYS * DAY_MS)

  // One marker per day and kind, so markers on the same day do not stack.
  const markers = useMemo(() => {
    const seen = new Map<string, { day: number; kind: "weak" | "dead"; names: string[] }>()
    for (const e of events) {
      const key = `${e.day}-${e.kind}`
      const m = seen.get(key) ?? { day: e.day, kind: e.kind, names: [] }
      m.names.push(e.name)
      seen.set(key, m)
    }
    return [...seen.values()]
  }, [events])

  const timeline = (
    <div className="sd-timeline">
      <div className="sd-track" role="group" aria-label={timelineText.markers}>
        {markers.map((m) => {
          const label = timelineText.marker(m.day, m.names.join(", "), m.kind)
          return (
            <button
              key={`${m.day}-${m.kind}`}
              type="button"
              className="sd-marker"
              data-kind={m.kind}
              data-passed={m.day <= shownDay ? "" : undefined}
              style={{ left: `calc(8px + (100% - 16px) * ${m.day / TIME_MACHINE_MAX_DAYS})` }}
              title={label}
              aria-label={label}
              onClick={() => onChange(m.day * DAY_MS)}
            >
              <StateGlyph state={m.kind === "weak" ? "weak" : "dead"} />
            </button>
          )
        })}
      </div>
      <div className="sd-ticks" aria-hidden="true">
        {timelineText.ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <p className="sd-events">
        {next.length > 0 ? (
          <>
            {timelineText.next}{" "}
            {next.map((e, i) => (
              <span key={`${e.id}-${e.kind}`}>
                {i > 0 && " · "}
                <b>{e.name}</b> {timelineText.event("", e.kind, e.day - shownDay).trimStart()}
              </span>
            ))}
          </>
        ) : events.length > 0 || engine.view(realNow).length > 0 ? (
          timelineText.none(TIME_MACHINE_MAX_DAYS)
        ) : (
          timelineText.empty
        )}
      </p>
    </div>
  )

  return (
    <div className="sd-dock" data-previewing={offsetMs > 0 ? "" : undefined} data-open={open ? "" : undefined}>
      <div className="sd-dock-in">
        <Candle age={age} />
        <button
          type="button"
          className="sd-dock-toggle"
          aria-expanded={open}
          aria-label={open ? timelineText.fold : timelineText.unfold}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true">{open ? "▾" : "▴"}</span>
        </button>
        <TimeMachine
          today={realNow}
          offsetMs={offsetMs}
          onChange={onChange}
          formatDate={formatDate}
          theme={studyDungeonShellTheme}
          wording={studyDungeonWording}
          frames={frames}
          clock={clock}
          prefersReducedMotion={prefersReducedMotion}
          belowSlider={timeline}
        />
      </div>
    </div>
  )
}
