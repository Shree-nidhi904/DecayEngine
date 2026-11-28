// - Lightning: one full-screen flash, replayed by remounting with a new key;
//   shown only inside the motion block with the Spooky level "haunted"
//   (animations.css). It ends itself through animationend. No timer.
// - Keeper: the guide, a skull with a lantern. Its eyes follow the pointer
//   (--pxr, --pyr on .sd-world) and its lantern dims as the dungeon gets
//   grim. The line is plain text, not a live region.
// - Ritual: the challenge's rune ring, rising spirits and "Risen" stamp.
// - Drips: water dripping from the ceiling (ambient, haunted only).
// All art is aria-hidden; the words beside it carry the meaning.

import type { DoomBand } from "../doom"
import { hauntText, keeperText } from "../wording"
import "../styles/haunt.css"

export type Strike = { n: number; kind: "dark" | "bright" }

export function Lightning({ strike, onDone }: { strike: Strike | null; onDone: () => void }) {
  if (strike === null) return null
  return <div key={strike.n} className="sd-lightning" data-kind={strike.kind} aria-hidden="true" onAnimationEnd={onDone} />
}

export function Keeper({ line, band }: { line: string; band: DoomBand }) {
  return (
    <div className="sd-keeper" data-band={band}>
      <svg className="sd-keeper-art" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
        {/* The lantern on its hook. */}
        <path className="sd-keeper-hook" d="M56 6v10" />
        <rect className="sd-keeper-lantern" x="49" y="16" width="14" height="18" rx="3" />
        <circle className="sd-keeper-light" cx="56" cy="25" r="5" />
        {/* The skull. */}
        <path
          className="sd-keeper-skull"
          d="M28 18c-11 0-19 8-19 19 0 7 3 11 7 14v8h6v-5h4v5h4v-5h4v5h6v-8c4-3 7-7 7-14 0-11-8-19-19-19z"
        />
        <g className="sd-keeper-eyes">
          <circle cx="21" cy="37" r="5" />
          <circle cx="35" cy="37" r="5" />
          <circle className="sd-keeper-pupil" cx="21" cy="37" r="1.8" />
          <circle className="sd-keeper-pupil" cx="35" cy="37" r="1.8" />
        </g>
        <path className="sd-keeper-nose" d="M28 43l-2.5 4h5z" />
      </svg>
      <p className="sd-keeper-line">
        <span className="sd-visually-hidden">{keeperText.name}: </span>
        {line}
      </p>
    </div>
  )
}

const SPIRITS = [0, 1, 2, 3, 4, 5, 6, 7]

export function Ritual() {
  return (
    <span className="sd-ritual" aria-hidden="true">
      <svg className="sd-ritual-ring" viewBox="0 0 120 120" focusable="false">
        <circle cx="60" cy="60" r="54" />
        <circle cx="60" cy="60" r="44" />
        <path d="M60 6l8 14h-16zM114 60l-14 8v-16zM60 114l-8-14h16zM6 60l14-8v16z" />
      </svg>
      {SPIRITS.map((i) => (
        <span key={i} className="sd-spirit" style={{ ["--i" as string]: String(i) }} />
      ))}
      <span className="sd-ritual-stamp">{hauntText.risenStamp}</span>
    </span>
  )
}

export function Drips() {
  return (
    <span className="sd-drips" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}
