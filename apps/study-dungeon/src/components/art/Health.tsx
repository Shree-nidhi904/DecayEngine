// The health orb and the health bar (visual pass, Pass 2). Ported from the
// wireframe's orb() and bar(). The bar shows the weak and dead marks, and a
// hatched "lost" segment for the health lost since the last review.
//
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.

import { useId } from "react"
import { HEALTH_MARKS } from "../../creatures"

const clamp = (n: number) => Math.min(100, Math.max(0, n))

/** A glass orb filled to the fact's health. Decoration: the number is written beside it. */
export function HealthOrb({ health }: { health: number }) {
  const clipId = useId()
  const y = 38 - (34 * clamp(health)) / 100
  return (
    <svg className="sd-orb" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clipId}>
          <circle cx="22" cy="22" r="17" />
        </clipPath>
      </defs>
      <circle cx="22" cy="22" r="19" fill="#030207" stroke="#4a3858" strokeWidth="2" />
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y={y} width="44" height="44" fill="#ff8a2b" />
        <path d={`M0 ${y}q6-4 11 0t11 0 11 0 11 0v-3H0z`} fill="#ffb56b" />
      </g>
      <ellipse cx="15" cy="13" rx="4" ry="2.4" fill="#fff" opacity=".35" transform="rotate(-35 15 13)" />
    </svg>
  )
}

export interface HealthBarProps {
  /** Health now (0-100). */
  health: number
  /** Health right after the last review; the hatched segment is base − health. */
  base?: number
}

/**
 * Health as a bar, with marks at the weak (60) and dead (10) thresholds and a
 * key underneath. Its label says the same in words.
 */
export function HealthBar({ health, base }: HealthBarProps) {
  const h = clamp(health)
  const lost = base === undefined ? 0 : Math.max(0, clamp(base) - h)
  return (
    <div className="sd-bar-wrap">
      <div
        className="sd-bar"
        role="img"
        aria-label={`Health ${Math.floor(h)} of 100. Weak below ${HEALTH_MARKS.weak}, dead below ${HEALTH_MARKS.dead}.`}
      >
        <div className="sd-bar-fill" style={{ width: `${Math.max(2, h)}%` }} />
        {lost > 0 && <div className="sd-bar-loss" data-testid="bar-loss" style={{ left: `${h}%`, width: `${lost}%` }} />}
        <div className="sd-bar-mark" data-mark="dead" style={{ left: `${HEALTH_MARKS.dead}%` }} />
        <div className="sd-bar-mark" data-mark="weak" style={{ left: `${HEALTH_MARKS.weak}%` }} />
      </div>
      <div className="sd-bar-key" aria-hidden="true">
        <span style={{ width: `${HEALTH_MARKS.dead}%` }}>dead</span>
        <span style={{ width: `${HEALTH_MARKS.weak - HEALTH_MARKS.dead}%` }}>weak</span>
        <span>alive</span>
      </div>
    </div>
  )
}
