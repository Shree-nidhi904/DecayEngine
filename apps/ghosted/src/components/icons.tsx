// State glyphs and contact marker shapes (task 4.1, design section 5.2).
// Inline SVG only, ported from the wireframe's symbols. Every glyph draws in
// currentColor and is aria-hidden: the state word next to it is the text
// (Req 16.1). Colours come from window.css (mint, flick, rust).

import type { ReactNode } from "react"
import type { StateIcons } from "@decay-engine/shell"
import type { ShownState } from "../lists"
import "../styles/window.css"

export type GlyphShape = "circle" | "triangle" | "cross"

/** The glyph each shown state uses: lit and lit again share the circle. */
export const glyphOf: Readonly<Record<ShownState, GlyphShape>> = {
  alive: "circle",
  litAgain: "circle",
  weak: "triangle",
  dead: "cross",
}

/** One state glyph, 16 × 16 units, scaled by CSS (`.gh-glyph`). */
export function Glyph({ shape }: { shape: GlyphShape }) {
  return (
    <svg className="gh-glyph" data-glyph={shape} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {shape === "circle" && <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" />}
      {shape === "triangle" && (
        <>
          <path d="M8 1.5 15 14H1z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 6v4" stroke="currentColor" strokeWidth="2" />
        </>
      )}
      {shape === "cross" && (
        <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      )}
    </svg>
  )
}

/** The glyph for a shown state. */
export function StateGlyph({ state }: { state: ShownState }) {
  return <Glyph shape={glyphOf[state]} />
}

/** The glyphs for the shell's Counters and other shell components (StateIcons). */
export const ghostedIcons: StateIcons = {
  alive: <Glyph shape="circle" />,
  weak: <Glyph shape="triangle" />,
  dead: <Glyph shape="cross" />,
}

/**
 * One contact marker for the autopsy chart's renderMarker (Req 19.2, 28):
 * centred on 0,0 and about 10 units wide, in --sign. The shapes differ from
 * each other and from the state glyphs: a message is an envelope, a call a
 * filled diamond, a meet-up two overlapping dots. Unknown kinds get a dot.
 */
export function renderContactMarker(kind: string): ReactNode {
  // Drawn in currentColor; .gh-marker sets it to --sign (window.css).
  switch (kind) {
    case "text":
      return (
        <g className="gh-marker" data-shape="envelope">
          <rect x="-5" y="-3.5" width="10" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M-5 -3.5 0 0.8 5 -3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </g>
      )
    case "call":
      return (
        <g className="gh-marker" data-shape="diamond">
          <path d="M0 -5 5 0 0 5 -5 0z" fill="currentColor" />
        </g>
      )
    case "meetup":
      return (
        <g className="gh-marker" data-shape="two-dots">
          <circle cx="-2" cy="0" r="3" fill="currentColor" />
          <circle cx="2.2" cy="0" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </g>
      )
    default:
      return (
        <g className="gh-marker" data-shape="dot">
          <circle cx="0" cy="0" r="3" fill="currentColor" />
        </g>
      )
  }
}
