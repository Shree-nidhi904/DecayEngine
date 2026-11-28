// The time dock (visual pass, Pass 3): the shell's TimeMachine in a dock
// fixed to the bottom of the screen, beside a candle that melts as you look
// further ahead. Under the slider: markers for the days a fact weakens or
// dies (click one to jump there) and a "Next:" line.
// Reads only: today's facts and the engine's forecast.
//
// Task L2 (task 21.2 and 21.3, Requirement 19, design "Compact Time Dock"):
// the dock is collapsed by default at every width to one bar (the small
// candle, the title, the date line, the slider, the hint "Drag to look
// ahead" and the "Coming up" toggle). The TimeMachine stays mounted in both
// states, so the offset and Play are never lost. While collapsed, the
// timeline (markers, ticks and the "Next:" line) is not rendered, and
// dock.css hides the shell's jumps and Play. The choice is kept in
// sessionStorage (dock-state.ts). The dock measures its own height into
// --dock-h on the root element, so the page keeps that much room at the
// bottom (world.css); without ResizeObserver the CSS fallbacks apply.
//
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.
// Changed by Kiro for task L2 (tasks 21.2 and 21.3), as the spec names it; see docs/KIRO_LOG.md.
// Changed by Kiro for task L3 (task 25.4): the optional `notice` slot, first in the dock.
// Changed by Kiro for the feedback list (points 8 and 16): "Back to today" on the dock, and "Coming up" with its timeline after the time machine in the markup (dock.css).
// Changed by Kiro for task L6 (task 27.3): the optional `firstLook` prop (first-look-dock.ts); the onChange prop is wrapped by its hook.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { useFirstLookDock, type FirstLookDockControl } from "../first-look-dock"
import { TimeMachine, TIME_MACHINE_MAX_DAYS, TIME_MACHINE_MAX_OFFSET_MS, type FrameScheduler } from "@decay-engine/shell"
import { readDockExpanded, writeDockExpanded, type SessionFlagStorage } from "../dock-state"
import type { StudyDungeonEngine } from "../engine-instance"
import { DAY_MS } from "../policy"
import { studyDungeonShellTheme } from "../theme"
import { timelineEvents, upcoming } from "../timeline"
import { studyDungeonWording, timelineText } from "../wording"
import { Candle, StateGlyph } from "./art/Scenery"

/** The custom property the dock's measured height goes into, on the root element (Req 19.7). */
export const DOCK_HEIGHT_PROPERTY = "--dock-h"

/**
 * Keeps --dock-h on the root element equal to the dock's border-box height,
 * in whole pixels (rounded up), while the dock is on the page (Req 19.7).
 * Feature-detects ResizeObserver: without it (jsdom, old browsers) nothing
 * is set and the CSS fallbacks in world.css apply (Req 19.13).
 */
function useDockHeight(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current
    if (element === null || typeof globalThis.ResizeObserver !== "function") return
    const root = document.documentElement
    const observer = new globalThis.ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry === undefined) return
      const box = entry.borderBoxSize?.[0]
      const height = box !== undefined ? box.blockSize : element.getBoundingClientRect().height
      root.style.setProperty(DOCK_HEIGHT_PROPERTY, `${Math.ceil(height)}px`)
    })
    observer.observe(element, { box: "border-box" })
    return () => {
      observer.disconnect()
      root.style.removeProperty(DOCK_HEIGHT_PROPERTY)
    }
  }, [ref])
}

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
  /** Where the expanded choice is kept for the tab (the App's `session`). Null or omitted: React state only. */
  session?: SessionFlagStorage | null
  /**
   * Task L3 (Requirement 23.4, added by Kiro): the live-change message, shown
   * at the top of the dock, inside its box, so it covers nothing and the
   * measured --dock-h includes it. Omitted: the dock renders exactly as before.
   */
  notice?: ReactNode
  /**
   * Task L6 (Requirement 25.5, 25.8, added by Kiro): while `active`, the
   * first look runs on this dock's own Play, and a touch of the slider, a
   * jump, a marker or Play ends it. Omitted: the dock behaves as before.
   */
  firstLook?: FirstLookDockControl
  /**
   * Feedback list, point 16 (added by Kiro): while previewing, the dock shows
   * "Future preview · nothing is saved" and this "Back to today" button on its own
   * bar, instead of a banner at the top of the page. No icons.
   */
  onBackToToday?: () => void
}

export function TimeDock({
  engine,
  realNow,
  offsetMs,
  onChange: onChangeProp,
  formatDate,
  version,
  frames,
  clock,
  prefersReducedMotion,
  session = null,
  notice,
  firstLook,
  onBackToToday,
}: TimeDockProps) {
  const events = useMemo(
    () =>
      timelineEvents(engine.view(realNow), engine.forecast(realNow, TIME_MACHINE_MAX_DAYS * DAY_MS), realNow, TIME_MACHINE_MAX_DAYS),
    [engine, realNow, version]
  )
  // Collapsed unless this tab expanded it before (Req 19.1, 19.5). Read once, on mount.
  const [expanded, setExpanded] = useState(() => readDockExpanded(session))
  const toggle = useCallback(() => {
    const next = !expanded
    setExpanded(next)
    writeDockExpanded(session, next)
  }, [expanded, session])
  const panelId = `${useId()}-panel`

  const dockRef = useRef<HTMLDivElement>(null)
  useDockHeight(dockRef)
  // Task L6: the slider, the jumps, Play and the markers below go through the hook's `change`.
  const look = useFirstLookDock(dockRef, firstLook, onChangeProp, TIME_MACHINE_MAX_OFFSET_MS, ".sd-dock-toggle")
  const onChange = look.change

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

  // Everything on one line, inside the time machine's bar: the toggle ("Coming up") right after the
  // slider, and while previewing "Back to today" beside it. Only the timeline (markers, ticks, "Next:")
  // opens below the bar. No hint line, no icons.
  const belowSlider = (
    <div className="sd-dock-actions">
      <button
        type="button"
        className="sd-dock-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span className="sd-dock-toggle-glyph" aria-hidden="true">
          {expanded ? "▾" : "▴"}
        </span>
        <span>{timelineText.toggle}</span>
      </button>
      {offsetMs > 0 && onBackToToday !== undefined && (
        <button type="button" className="sd-button sd-dock-back" onClick={onBackToToday}>
          {studyDungeonWording.preview.backToToday}
        </button>
      )}
    </div>
  )
  const comingUp = (
    <div className="sd-dock-bottom">
      <div id={panelId} className="sd-dock-panel">
        {expanded && timeline}
      </div>
    </div>
  )

  return (
    <div
      ref={dockRef}
      className="sd-dock"
      data-previewing={offsetMs > 0 ? "" : undefined}
      data-open={expanded ? "" : undefined}
      {...(firstLook === undefined ? {} : look.handlers)}
    >
      {notice}
      <div className="sd-dock-in">
        <Candle age={age} />
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
          belowSlider={belowSlider}
        />
        {comingUp}
        {offsetMs > 0 && onBackToToday !== undefined && (
          <p className="sd-visually-hidden" role="status">
            {studyDungeonWording.preview.banner}
          </p>
        )}
      </div>
    </div>
  )
}
