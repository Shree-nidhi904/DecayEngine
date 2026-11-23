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
//
// Task L2 (Req 34, design section 11): the dock is collapsed by default to
// one bar (the small moon, the title, the date line, the slider, the hint
// "Drag to look ahead" and the "Coming up" toggle). The TimeMachine stays
// mounted in both states, so the offset and Play are never lost. While
// collapsed, the app's own parts (the marker track, its ticks and the
// screen-reader marker list) are not rendered, and dock.css hides the
// shell's jumps and Play. The preview banner shows in both states. The
// choice is kept in sessionStorage (dock-state.ts). Each marker shows a
// short "goes dark in N days" label on hover and on keyboard focus. The dock
// measures its own height into --dock-h on the root element, so the page
// keeps that much room at the bottom (layout.css); without ResizeObserver
// the CSS fallback (--dock-max) applies.
//
// Task L6 (Req 40, design section 17.3): the optional `firstLook` prop lets
// the App run the first look on this dock's own Play (first-look-dock.ts).
// The slider, the jumps, Play and the markers then go through the hook's
// `change`, and "Back to today" ends a running first look first.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react"
import { PreviewBanner, TimeMachine, type FrameScheduler } from "@decay-engine/shell"
import { readDockExpanded, writeDockExpanded } from "../dock-state"
import { useFirstLookDock, type FirstLookDockControl } from "../first-look-dock"
import type { SessionFlagStorage } from "../splash"
import { ghostedShellTheme } from "../theme"
import { DAY_MS } from "../time"
import { DOCK_DAYS, makeDayFormatter, markerLabel, markerRows, markerSoonLabel, type DockMarker } from "../timeline"
import { dockText, ghostedWording } from "../wording"
import { StateGlyph } from "./icons"
import "../styles/dock.css"

/** The custom property the dock's measured height goes into, on the root element (Req 34.7). */
export const DOCK_HEIGHT_PROPERTY = "--dock-h"

/**
 * Keeps --dock-h on the root element equal to the dock's border-box height,
 * in whole pixels, while the dock is on the page (Req 34.7). Feature-detects
 * ResizeObserver: without it (jsdom, old browsers) nothing is set and the CSS
 * fallback applies (Req 34.12).
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

/** The toggle's chevron: points up while collapsed (there is more above), turned while expanded (dock.css). */
function Chevron() {
  return (
    <svg className="gh-dock-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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
  /** Where the expanded choice is kept for the tab (the App's `session`). Null or omitted: React state only. */
  session?: SessionFlagStorage | null
  /**
   * Task L3 (Req 38.4): the live-change message, shown at the top of the
   * dock, inside its box, so it covers nothing and the measured --dock-h
   * includes it. Omitted: the dock is exactly as before.
   */
  notice?: ReactNode
  /**
   * Task L6 (Req 40.5, 40.8, design 17.3): while `active`, the first look runs
   * on this dock's own Play, and a touch of the slider, a jump, a marker,
   * Play or "Back to today" ends it. Omitted: the dock is exactly as before.
   */
  firstLook?: FirstLookDockControl
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
  session = null,
  notice,
  firstLook,
}: MoonDockProps) {
  const formatDay = useMemo(() => makeDayFormatter(timeZone), [timeZone])
  const previewing = offsetMs > 0
  const age = Math.min(1, Math.max(0, offsetMs / (DOCK_DAYS * DAY_MS)))
  const shownDay = Math.floor(offsetMs / DAY_MS)
  // Markers that fall close together are staggered over up to three rows (dock.css), so every glyph stays visible.
  const rows = useMemo(() => markerRows(markers), [markers])
  const rowCount = rows.length === 0 ? 1 : Math.max(...rows) + 1

  // Collapsed unless this tab expanded it before (Req 34.1, 34.5). Read once, on mount.
  const [expanded, setExpanded] = useState(() => readDockExpanded(session))
  const toggle = useCallback(() => {
    const next = !expanded
    setExpanded(next)
    writeDockExpanded(session, next)
  }, [expanded, session])
  const panelId = `${useId()}-panel`

  const dockRef = useRef<HTMLDivElement>(null)
  useDockHeight(dockRef)
  // Task L6: the slider, the jumps, Play and the markers go through `change`.
  const look = useFirstLookDock(dockRef, firstLook, onChange, DOCK_DAYS * DAY_MS, ".gh-dock-toggle")
  const change = look.change

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
              onClick={() => change(marker.day * DAY_MS)}
            >
              <StateGlyph state={marker.type === "fades" ? "weak" : "dead"} />
              {/* Shown on hover and on keyboard focus (dock.css). The button's name is the label above. */}
              <span className="gh-dock-mark-tip" aria-hidden="true">
                {markerSoonLabel(marker)}
              </span>
            </button>
          )
        })}
      </div>
      <div className="gh-dock-ticks" aria-hidden="true">
        {dockText.ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
      {markers.length > 0 && (
        <ol className="gh-sr-only" aria-label={dockText.markerList}>
          {markers.map((marker) => (
            <li key={`${marker.id}-${marker.type}`}>{markerSoonLabel(marker)}</li>
          ))}
        </ol>
      )}
    </div>
  )

  // Right under the slider, so the toggle comes straight after it in the Tab order (Req 34.9).
  const belowSlider = (
    <>
      {!expanded && <p className="gh-dock-hint">{dockText.hint}</p>}
      <button
        type="button"
        className="gh-button gh-dock-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={toggle}
      >
        <Chevron />
        <span>{dockText.toggle}</span>
      </button>
      <div id={panelId} className="gh-dock-panel">
        {expanded && track}
      </div>
    </>
  )

  return (
    <div
      ref={dockRef}
      className="gh-dock"
      data-previewing={previewing ? "" : undefined}
      data-expanded={expanded ? "" : undefined}
      style={{ "--age": age.toFixed(4) } as CSSProperties}
      {...(firstLook === undefined ? {} : look.handlers)}
    >
      {notice}
      <div className="gh-dock-in">
        <Moon />
        <div className="gh-dock-main">
          <TimeMachine
            today={today}
            offsetMs={offsetMs}
            onChange={change}
            formatDate={formatDate}
            theme={ghostedShellTheme}
            wording={ghostedWording}
            frames={frames}
            clock={clock}
            prefersReducedMotion={prefersReducedMotion}
            belowSlider={belowSlider}
            maxDays={DOCK_DAYS}
            jumpDays={DOCK_JUMP_DAYS}
          />
          {previewing && (
            <PreviewBanner theme={ghostedShellTheme} wording={ghostedWording} onBackToToday={() => {
                look.interrupt()
                onChange(0)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
