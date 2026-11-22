// Scenery for the visual pass (Pass 1 and Pass 3): torches, the atmosphere
// layers, the graveyard tree, a tombstone and the time machine's candle.
// Ported from docs/design/study-dungeon-wireframe.html. Original SVG only.
// Everything here is decoration and hidden from screen readers.
//
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.

import { CREATURES, type CreatureKind } from "../../creatures"

/** A wall torch. Its two flame paths flicker (animations.css). */
export function Torch({ className }: { className?: string }) {
  return (
    <svg className={`sd-torch${className === undefined ? "" : ` ${className}`}`} viewBox="0 0 44 92" aria-hidden="true" focusable="false">
      <path d="M15 40h14l-3 46a4 4 0 0 1-8 0z" fill="#3b2a1d" stroke="#1a110a" strokeWidth="2" />
      <rect x="11" y="34" width="22" height="9" rx="2" fill="#5a4030" stroke="#1a110a" strokeWidth="2" />
      <path className="sd-flame" d="M22 4c9 11 12 18 12 24a12 12 0 0 1-24 0c0-6 3-13 12-24z" fill="#ff8a2b" />
      <path className="sd-flame" d="M22 16c5 6 7 10 7 14a7 7 0 0 1-14 0c0-4 2-8 7-14z" fill="#ffd76a" />
    </svg>
  )
}

function Bat() {
  return (
    <svg className="sd-bat" viewBox="0 0 26 14" aria-hidden="true" focusable="false">
      <path
        d="M13 3l2 2 3-1c3-3 6-3 8-1-2 1-2 3-1 6-2-1-4 0-5 2-1-2-3-2-4-1l-2 3-2-3c-1-1-3-1-4 1-1-2-3-3-5-2 1-3 1-5-1-6 2-2 5-2 8 1l3 1z"
        fill="#3a2c4a"
      />
    </svg>
  )
}

/** Two bats crossing the header now and then. */
export function Bats() {
  return (
    <div className="sd-bats" aria-hidden="true">
      <Bat />
      <Bat />
    </div>
  )
}

function Cobweb({ side }: { side: "left" | "right" }) {
  return (
    <svg className={`sd-layer sd-web sd-web-${side}`} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <g stroke="#cfc8b6" strokeWidth="1" fill="none" opacity=".7">
        <path d="M0 0H120M0 0L110 50M0 0L80 90M0 0L45 112M0 0V120" />
        <path d="M30 0Q26 26 0 30M60 0Q50 50 0 60M90 0Q72 72 0 90M120 0Q96 96 0 120" />
      </g>
    </svg>
  )
}

/**
 * Fixed layers over the page that never take clicks: the room darkening and
 * the fog (both grow with --age), cobwebs (appear with --age), the vignette
 * and film grain.
 */
export function Atmosphere() {
  return (
    <>
      <div className="sd-layer sd-room-dark" aria-hidden="true" />
      <div className="sd-layer sd-fog" aria-hidden="true" />
      <div className="sd-layer sd-vignette" aria-hidden="true" />
      <div className="sd-layer sd-grain" aria-hidden="true" />
      <Cobweb side="left" />
      <Cobweb side="right" />
    </>
  )
}

/** The bare tree in the graveyard scene. */
export function Tree() {
  return (
    <svg className="sd-tree" viewBox="0 0 120 140" aria-hidden="true" focusable="false">
      <path
        d="M58 140l4-60-22-30 2-2 22 20 2-32-14-22 2-2 16 18 2-14 3 0 2 16 18-14 2 2-16 20 4 24 22-14 1 3-24 20 0 44z"
        fill="#05040a"
      />
    </svg>
  )
}

/** A cracked headstone with a skull and a flower in the creature's colour. */
export function Tombstone({ kind }: { kind: CreatureKind }) {
  return (
    <svg className="sd-stone-art" viewBox="0 0 120 124" aria-hidden="true" focusable="false">
      <ellipse cx="60" cy="116" rx="52" ry="6" fill="#000" opacity=".5" />
      <path d="M22 112V50a38 38 0 0 1 76 0v62z" fill="#34303f" stroke="#0a0810" strokeWidth="3" />
      <path d="M30 112V52a30 30 0 0 1 60 0v60" fill="none" stroke="#4a4458" strokeWidth="2" />
      <path d="M44 20l6 14-8 10 9 8-4 12" fill="none" stroke="#0a0810" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M60 40v22M50 49h20" stroke="#7a728a" strokeWidth="4" strokeLinecap="round" />
      <path d="M48 70h24M52 78h16" stroke="#a198b0" strokeWidth="3" strokeLinecap="round" opacity=".6" />
      <circle cx="46" cy="100" r="6" fill="#e8dec4" />
      <rect x="42" y="102" width="8" height="5" fill="#e8dec4" />
      <circle cx="44" cy="99" r="1.4" fill="#060509" />
      <circle cx="48" cy="99" r="1.4" fill="#060509" />
      <path d="M22 108c8-6 14 0 22-4s10 2 14 4v6H22z" fill="#1d5a28" />
      <path d="M84 110v-12M84 98c-5-3-5-9 0-10 5 1 5 7 0 10z" stroke="#1d5a28" strokeWidth="2" fill={CREATURES[kind].color} opacity=".9" />
    </svg>
  )
}

/** The candle in the time dock. It melts as you look further ahead (0 = today, 1 = +60 days). */
export function Candle({ age }: { age: number }) {
  const a = Math.min(1, Math.max(0, age))
  const top = 32
  const wax = Math.max(8, 44 * (1 - a))
  const drip = Math.min(14, wax - 2)
  return (
    <svg className="sd-candle" viewBox="0 0 64 92" aria-hidden="true" focusable="false">
      <circle className="sd-candle-glow" cx="32" cy="18" r="22" fill="#ff8a2b" />
      <g transform={`translate(0 ${44 - wax})`}>
        <path className="sd-flame" d="M32 2c7 9 9 14 9 19a9 9 0 0 1-18 0c0-5 2-10 9-19z" fill="#ff8a2b" />
        <path className="sd-flame" d="M32 12c3 4 4 7 4 9a4 4 0 0 1-8 0c0-2 1-5 4-9z" fill="#fff0cf" />
        <path d="M32 26v6" stroke="#1a110a" strokeWidth="2" />
        <rect x="20" y={top} width="24" height={wax} fill="#e8dec4" />
        <path d={`M20 ${top}v${drip}q3 5 6 0v-8q3-3 6 0v12q3 4 6 0v-9q3-2 6 0v-${drip}z`} fill="#e8dec4" />
      </g>
      <ellipse cx="32" cy="80" rx="24" ry="5" fill="#2b2235" />
      <rect x="10" y="76" width="44" height="6" rx="2" fill="#3b2d48" />
      <path d="M12 82h40l-4 8H16z" fill="#2b2235" />
    </svg>
  )
}

/** Small state glyphs from the steering rules: circle (alive), triangle (weak), cross (dead). */
export function StateGlyph({ state }: { state: "alive" | "weak" | "dead" }) {
  return (
    <svg className="sd-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false" data-glyph={state}>
      {state === "alive" && <circle cx="8" cy="8" r="6" fill="none" stroke="#9cf26b" strokeWidth="2" />}
      {state === "weak" && (
        <>
          <path d="M8 1.5 15 14H1z" fill="none" stroke="#ff8a2b" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 6v4" stroke="#ff8a2b" strokeWidth="2" />
        </>
      )}
      {state === "dead" && <path d="M3 3l10 10M13 3L3 13" stroke="#ff5f77" strokeWidth="2.4" strokeLinecap="round" />}
    </svg>
  )
}

/** The empty graveyard: grass, flowers in every creature colour, no stones. */
export function PeacefulYard() {
  const flowers = [
    [30, "#9cf26b"], [70, "#b48cff"], [115, "#ff8a2b"], [160, "#4fd8e8"], [205, "#9cf26b"], [250, "#b48cff"],
  ] as const
  return (
    <svg className="sd-yard-art" viewBox="0 0 280 70" aria-hidden="true" focusable="false">
      <path d="M0 60q35-10 70 0t70 0 70 0 70 0v10H0z" fill="#12361c" />
      {flowers.map(([x, color]) => (
        <g key={x} className="sd-flower">
          <path d={`M${x} 60v-18`} stroke="#1d5a28" strokeWidth="2" />
          <path d={`M${x - 6} 52q6-6 6 0M${x + 6} 50q-6-6-6 0`} fill="#1d5a28" />
          <circle cx={x} cy="40" r="5" fill={color} />
          <circle cx={x} cy="40" r="2" fill="#fff6c8" />
        </g>
      ))}
    </svg>
  )
}
