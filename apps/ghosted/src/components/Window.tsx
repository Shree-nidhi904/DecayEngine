// One person's window: pure art (task 4.1, design sections 4.4 and 5.1;
// Req 16.3-16.5). Ported from the wireframe's pane: a frame with mullions, a
// silhouette inside unless dead, and two boards when dead or falling away.
//
// The light is --lit = health / 100, written with 4 decimals, and 0 for a
// dead person (Property 10). Background, glow and silhouette opacity all read
// it (window.css). data-state drives the colours and the flicker
// (motion.css, inside prefers-reduced-motion: no-preference only).

import type { CSSProperties } from "react"
import type { ShownState } from "../lists"
import "../styles/window.css"
import "../styles/motion.css"

export interface WindowProps {
  /** 0-100 at the time shown. */
  health: number
  state: ShownState
  size: "street" | "card" | "dialog" | "splash"
  /** data-relight: one warm flash after a contact or reconnect. */
  relight?: boolean
  /** Dead: "on" (the default). ReconnectDialog's success: "falling". */
  boards?: "on" | "falling"
}

/** --lit for a window: health / 100 clamped to 0-1, 4 decimals; 0 when dead. */
export function litValue(health: number, state: ShownState): string {
  if (state === "dead") return "0"
  const lit = Math.min(1, Math.max(0, health / 100))
  return lit.toFixed(4)
}

export function Window({ health, state, size, relight = false, boards }: WindowProps) {
  const dead = state === "dead"
  const boardsShown = dead || boards === "falling"
  const boardsAttr = boardsShown ? (boards ?? "on") : undefined
  const style = { "--lit": litValue(health, state) } as CSSProperties

  return (
    <span
      className="gh-pane"
      data-state={state}
      data-size={size}
      data-boards={boardsAttr}
      data-relight={relight ? "" : undefined}
      style={style}
      aria-hidden="true"
    >
      {!dead && (
        <svg className="gh-sil" viewBox="0 0 40 44" aria-hidden="true" focusable="false">
          <circle cx="20" cy="14" r="9" />
          <path d="M2 44c0-14 8-20 18-20s18 6 18 20z" />
        </svg>
      )}
      {boardsShown && (
        <span className="gh-boards">
          <span className="gh-board" />
          <span className="gh-board" />
        </span>
      )}
    </span>
  )
}
