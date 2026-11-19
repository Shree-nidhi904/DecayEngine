// Floating particles drawn with CSS only: embers rising from the torches,
// fireflies over the graves, dust motes in the crypt. Each particle gets its
// own place, size, delay and duration from a fixed pattern (no randomness,
// so renders are stable). They move only under
// prefers-reduced-motion: no-preference (animations.css).
//
// Written by Claude Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import type { CSSProperties } from "react"

type Kind = "ember" | "firefly" | "mote"

function particles(kind: Kind, count: number) {
  return Array.from({ length: count }, (_, i) => {
    // A golden-ratio walk spreads them evenly without looking like a grid.
    const t = (i * 0.618034) % 1
    const style = {
      "--x": `${(t * 100).toFixed(1)}%`,
      "--y": `${(((i * 0.381966) % 1) * 100).toFixed(1)}%`,
      "--d": `${(-(i * 1.7) % 9).toFixed(2)}s`,
      "--t": `${(6 + ((i * 2.3) % 5)).toFixed(2)}s`,
      "--s": `${(2 + ((i * 1.3) % 3)).toFixed(1)}px`,
      "--dx": `${(((i % 5) - 2) * 9).toFixed(0)}px`,
    } as CSSProperties
    return <i key={i} className={`sd-particle sd-${kind}`} style={style} />
  })
}

export function Embers({ count = 14 }: { count?: number }) {
  return (
    <div className="sd-particles" aria-hidden="true">
      {particles("ember", count)}
    </div>
  )
}

export function Fireflies({ count = 12 }: { count?: number }) {
  return (
    <div className="sd-particles" aria-hidden="true">
      {particles("firefly", count)}
    </div>
  )
}

export function Motes({ count = 12 }: { count?: number }) {
  return (
    <div className="sd-particles" aria-hidden="true">
      {particles("mote", count)}
    </div>
  )
}

/** A burst of sparks for a win in a fight. */
export function Sparks({ color }: { color: string }) {
  return (
    <div className="sd-sparks" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2
        const d = 46 + ((i * 17) % 40)
        const style = {
          "--dx": `${(Math.cos(a) * d).toFixed(1)}px`,
          "--dy": `${(Math.sin(a) * d).toFixed(1)}px`,
          background: color,
        } as CSSProperties
        return <i key={i} style={style} />
      })}
    </div>
  )
}
