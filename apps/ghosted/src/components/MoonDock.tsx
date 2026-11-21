// The moon-clock dock (task 5.1, design sections 4.4 MoonDock, 5.1 and 9.6;
// Req 12.1-12.7, 16.1, 24.4, 25.1, 25.3, 26), ported from the wireframe's
// .dock. Written for Ghosted; Study Dungeon's TimeDock was only a model for
// the structure (no import from apps/study-dungeon, Req 21.1).
//
// Fixed at the bottom of the page (dock.css):
// - the moon (aria-hidden SVG). Its shade reads --age, which this dock sets
//   to offset / 365 days on its own root (the App sets the same value on
//   .gh-app, where the street's dim layer reads it), so the moon crosses the
//   sky in proportion to how far ahead you look (Req 12.3);
// - the shell TimeMachine with 365 days and jumps of +30, +90, +180 days and
//   +1 year (Req 12.1, 26). Play is the shell's, so under reduced motion it
//   jumps straight to +1 year (Req 25.3);
// - under the slider, the marker track: one button per marker from
//   timeline.ts, placed at day / 365 of the track (--at), with the triangle (starts
//   fading) or the cross (goes dark) and a name such as "Mira Castell goes
//   dark on 3 March". Activating one jumps there (Req 12.4). Markers that fall
//   close together are staggered over up to three rows (markerRows sets
//   data-row; dock.css places the rows), so every glyph stays visible;
// - while previewing, the shell PreviewBanner with "Back to today", which
//   sets the offset back to 0 (Req 12.5, 12.6). It comes last in the Tab
//   order (design section 9.5).
//
// The dock adds no filled button of its own: the shell's Play is the
// region's primary action (amended Req 30.4). Engine calls: none; the App
// passes the markers, computed at the real time.

import { useId, useMemo, type CSSProperties } from "react"
import { PreviewBanner, TimeMachine, type FrameScheduler } from "@decay-engine/shell"
import { ghostedShellTheme } from "../theme"
import { DAY_MS } from "../time"
import { DOCK_DAYS, makeDayFormatter, markerLabel, markerRows, type DockMarker } from "../timeline"
import { dockText, ghostedWording } from "../wording"
import { StateGlyph } from "./icons"
import "../styles/dock.css"

/** The dock's jumps, in this order; 365 reads "+1 year" (Req 12.1). */
export const DOCK_JUMP_DAYS: readonly number[] = [30, 90, 180, 365]

export interface MoonDockProps {
  /** The real time now (realNow): the slider's start. */
  today: number
  /** How far ahead is shown, in ms. 0 is today. */
  offsetMs: number
  /** The App's setPreviewOffsetMs. */
  onChange: (offsetMs: number) => void
  /** timeline.ts dockMarkers, computed at `today`. */
  markers: readonly DockMarker[]
  /** The previewed date in the time machine ("14 Nov 2023"). */
  formatDate: (ms: number) => string
  /** The time zone of the markers' dates ("3 March"). The viewer's when omitted. */
  timeZone?: string
  frames?: FrameScheduler
  clock?: () => number
  prefersReducedMotion?: () => boolean
}

/** The moon over the rooftops, from the wireframe. Colours are in dock.css. */
function Moon() {
  const clipId = `gh-moon-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  return (
    <svg className="gh-moon" viewBox="0 0 64 92" aria-hidden="true" focusable="false">
      <circle className="gh-moon-star" cx="12" cy="14" r="1.4" opacity="0.7" />
      <circle className="gh-moon-star" cx="52" cy="10" r="1.2" opacity="0.6" />
      <circle className="gh-moon-star" cx="48" cy="40" r="1" opacity="0.5" />
      <defs>
        <clipPath id={clipId}>
          <circle cx="32" cy="36" r="22" />
        </clipPath>
      </defs>
      <circle className="gh-moon-face" cx="32" cy="36" r="22" />
      <g clipPath={`url(#${clipId})`}>
        <circle className="gh-moon-shade" cx="32" cy="36" r="24" />
      </g>
      <circle className="gh-moon-rim" cx="32" cy="36" r="22" />
      <path className="gh-moon-roofs" d="M8 92V70h10v22M22 92V62h12v30M38 92V74h9v22M50 92V66h10v26" />
    </svg>
  )
}

export function MoonDock({
  today,
  offsetMs,
  onChange,
  markers,
  formatDate,
  timeZone,
  frames,
  clock,
  prefersReducedMotion,
}: MoonDockProps) {
  const formatDay = useMemo(() => makeDayFormatter(timeZone), [timeZone])
  const previewing = offsetMs > 0
  const age = Math.min(1, Math.max(0, offsetMs / (DOCK_DAYS * DAY_MS)))
  const shownDay = Math.floor(offsetMs / DAY_MS)
  // Markers that fall close together are staggered over up to three rows (dock.css), so every glyph stays visible.
  const rows = useMemo(() => markerRows(markers), [markers])
  const rowCount = rows.length === 0 ? 1 : Math.max(...rows) + 1

  const track = (
    <div className="gh-dock-timeline">
      <div className="gh-dock-track" role="group" aria-label={dockText.markers} data-rows={rowCount}>
        {markers.map((marker, index) => {
          const label = markerLabel(marker, formatDay)
          return (
            <button
              key={`${marker.id}-${marker.type}`}
              type="button"
              className="gh-dock-mark"
              data-type={marker.type}
              data-passed={marker.day <= shownDay ? "" : undefined}
              data-day={marker.day}
              data-row={rows[index]}
              style={{ "--at": String(marker.day / DOCK_DAYS) } as CSSProperties}
              aria-label={label}
              title={label}
              onClick={() => onChange(marker.day * DAY_MS)}
            >
              <StateGlyph state={marker.type === "fades" ? "weak" : "dead"} />
            </button>
          )
        })}
      </div>
      <div className="gh-dock-ticks" aria-hidden="true">
        {dockText.ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  )

  return (
    <div
      className="gh-dock"
      data-previewing={previewing ? "" : undefined}
      style={{ "--age": age.toFixed(4) } as CSSProperties}
    >
      <div className="gh-dock-in">
        <Moon />
        <div className="gh-dock-main">
          <TimeMachine
            today={today}
            offsetMs={offsetMs}
            onChange={onChange}
            formatDate={formatDate}
            theme={ghostedShellTheme}
            wording={ghostedWording}
            frames={frames}
            clock={clock}
            prefersReducedMotion={prefersReducedMotion}
            belowSlider={track}
            maxDays={DOCK_DAYS}
            jumpDays={DOCK_JUMP_DAYS}
          />
          {previewing && (
            <PreviewBanner theme={ghostedShellTheme} wording={ghostedWording} onBackToToday={() => onChange(0)} />
          )}
        </div>
      </div>
    </div>
  )
}
