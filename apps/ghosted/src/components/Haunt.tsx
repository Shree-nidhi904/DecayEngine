//
// - Lightning: one full-screen flash, replayed by remounting with a new key.
//   It only shows inside the motion block with the Spooky level "haunted"
//   (motion.css); it ends itself through animationend. No timer.
// - Wisp: the guide. A small ghost whose eyes follow the pointer (--pxr,
//   --pyr set on .gh-app) and who droops when the street is grim. The line is
//   plain text, not a live region (Req 5.4).
// - StreetPulse: a heartbeat line; its beat speeds up with --doom, and the
//   word (steady, uneasy, faint) says the same thing.
// - Ritual: the reconnect's ring of light, rising spirits and stamp.
// All art is aria-hidden; the words beside it carry the meaning.

import type { DoomBand } from "../doom"
import { hauntText, wispText } from "../wording"
import "../styles/haunt.css"
import "../styles/motion.css"

export type Strike = { n: number; kind: "dark" | "bright" }

export function Lightning({ strike, onDone }: { strike: Strike | null; onDone: () => void }) {
  if (strike === null) return null
  return (
    <div
      key={strike.n}
      className="gh-lightning"
      data-kind={strike.kind}
      aria-hidden="true"
      onAnimationEnd={onDone}
    />
  )
}

export function Wisp({ line, band }: { line: string; band: DoomBand }) {
  return (
    <div className="gh-wisp" data-band={band}>
      <svg className="gh-wisp-art" viewBox="0 0 64 72" aria-hidden="true" focusable="false">
        <path
          className="gh-wisp-body"
          d="M32 4C17 4 8 16 8 31v33l7-6 6 6 6-6 5 6 5-6 6 6 6-6 7 6V31C56 16 47 4 32 4z"
        />
        <g className="gh-wisp-eyes">
          <ellipse cx="24" cy="30" rx="4.5" ry="6" />
          <ellipse cx="40" cy="30" rx="4.5" ry="6" />
        </g>
        <path className="gh-wisp-mouth" d="M27 44q5 5 10 0" />
        <circle className="gh-wisp-cheek" cx="17" cy="40" r="3" />
        <circle className="gh-wisp-cheek" cx="47" cy="40" r="3" />
      </svg>
      <p className="gh-wisp-line">
        <span className="gh-visually-hidden">{wispText.name}: </span>
        {line}
      </p>
    </div>
  )
}

/** One beat of an EKG, repeated three times across a 240-wide box. */
const BEAT = "h22 l6 -10 l6 22 l6 -26 l6 14 h34"
const PULSE_PATH = `M0 20 ${BEAT} ${BEAT} ${BEAT}`

export function StreetPulse({ band }: { band: DoomBand }) {
  return (
    <p className="gh-pulse" data-band={band}>
      <svg className="gh-pulse-line" viewBox="0 0 240 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path className="gh-pulse-ghost" d={PULSE_PATH} />
        <path className="gh-pulse-trace" d={PULSE_PATH} pathLength={100} />
      </svg>
      <span className="gh-label">{hauntText.pulseLabel}</span>{" "}
      <span className="gh-pulse-word">{hauntText.pulse[band]}</span>
    </p>
  )
}

/** Eight spirits rising around the window, each with its own place and delay (--i). */
const SPIRITS = [0, 1, 2, 3, 4, 5, 6, 7]

export function Ritual() {
  return (
    <span className="gh-ritual" aria-hidden="true">
      <span className="gh-ritual-ring" />
      {SPIRITS.map((i) => (
        <span key={i} className="gh-spirit" style={{ ["--i" as string]: String(i) }} />
      ))}
      <span className="gh-ritual-stamp">{hauntText.litAgainStamp}</span>
    </span>
  )
}

/** A ghost drifting along the street while at least one window is dark (ambient, haunted only). */
export function StreetGhost() {
  return (
    <svg className="gh-street-ghost" viewBox="0 0 64 72" aria-hidden="true" focusable="false">
      <path d="M32 4C17 4 8 16 8 31v33l7-6 6 6 6-6 5 6 5-6 6 6 6-6 7 6V31C56 16 47 4 32 4z" />
      <ellipse cx="24" cy="30" rx="4" ry="5.5" className="gh-street-ghost-eye" />
      <ellipse cx="40" cy="30" rx="4" ry="5.5" className="gh-street-ghost-eye" />
    </svg>
  )
}

/** Stars and a moon glow above the houses. Fixed places, so nothing changes between renders. */
const STARS: readonly [number, number, number][] = [
  [6, 12, 1.2], [14, 30, 0.8], [22, 8, 1], [31, 22, 0.7], [38, 6, 1.3], [47, 18, 0.9],
  [55, 9, 0.8], [63, 26, 1.1], [71, 5, 0.9], [79, 16, 1.2], [86, 28, 0.7], [93, 11, 1],
]

export function Sky() {
  return (
    <span className="gh-sky" aria-hidden="true">
      {STARS.map(([x, y, s], i) => (
        <i
          key={i}
          className="gh-star"
          style={{ ["--x" as string]: `${x}%`, ["--y" as string]: `${y}%`, ["--s" as string]: String(s), ["--i" as string]: String(i) }}
        />
      ))}
      <span className="gh-sky-moon" />
      <span className="gh-cloud" />
      <span className="gh-cloud" />
      <span className="gh-bat" />
      <span className="gh-bat" />
    </span>
  )
}
