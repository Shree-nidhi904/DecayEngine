// The four creatures (slime, bat, imp, eye) in four moods (sleep, worried,
// feral, happy). Ported from the wireframe's creature() function
// (docs/design/study-dungeon-wireframe.html). Original SVG, no assets.
// Decoration only: hidden from screen readers, the card says the state in words.
//
// Written by - Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import type { ReactNode } from "react"
import { CREATURES, type CreatureKind, type Mood } from "../../creatures"

const INK = "#060509"
const WHITE = "#f4efe0"

function Eyes({ mood, x1, x2, y, r }: { mood: Mood; x1: number; x2: number; y: number; r: number }) {
  if (mood === "sleep") {
    return (
      <>
        {[x1, x2].map((x) => (
          <path key={x} d={`M${x - r} ${y}Q${x} ${y + r} ${x + r} ${y}`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        ))}
      </>
    )
  }
  if (mood === "happy") {
    return (
      <>
        {[x1, x2].map((x) => (
          <path
            key={x}
            d={`M${x - r} ${y + r * 0.5}Q${x} ${y - r * 0.9} ${x + r} ${y + r * 0.5}`}
            fill="none"
            stroke={INK}
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        ))}
      </>
    )
  }
  const feral = mood === "feral"
  const pupil = feral ? r * 0.38 : r * 0.55
  const off = feral ? 0 : 1.6
  return (
    <>
      <circle cx={x1} cy={y} r={r} fill={WHITE} stroke={INK} strokeWidth="1.5" />
      <circle cx={x2} cy={y} r={r} fill={WHITE} stroke={INK} strokeWidth="1.5" />
      <circle cx={x1 + off} cy={y + 1} r={pupil} fill={INK} />
      <circle cx={x2 + off} cy={y + 1} r={pupil} fill={INK} />
      {feral && (
        <path
          d={`M${x1 - r - 1} ${y - r - 2}L${x1 + r} ${y - r + 3}M${x2 + r + 1} ${y - r - 2}L${x2 - r} ${y - r + 3}`}
          stroke={INK}
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
    </>
  )
}

function Mouth({ mood, x, y }: { mood: Mood; x: number; y: number }) {
  if (mood === "feral") {
    return (
      <>
        <path d={`M${x - 13} ${y}Q${x} ${y + 16} ${x + 13} ${y}Z`} fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        <path d={`M${x - 10} ${y + 1}l3 6 3-5 4 7 4-7 3 5 3-6z`} fill={WHITE} />
        <path d={`M${x + 8} ${y + 9}q2 8 0 10 q-3-3 0-10z`} fill="#9cf26b" opacity=".7" />
      </>
    )
  }
  if (mood === "happy") {
    return (
      <>
        <path d={`M${x - 10} ${y}Q${x} ${y + 15} ${x + 10} ${y}Z`} fill={INK} />
        <ellipse cx={x} cy={y + 8} rx="4.5" ry="2.6" fill="#ff8aa0" />
      </>
    )
  }
  if (mood === "sleep") {
    return <path d={`M${x - 6} ${y}Q${x} ${y + 5} ${x + 6} ${y}`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
  }
  return (
    <>
      <path d={`M${x - 10} ${y}q5 6 10 3 q5 3 10 -3`} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d={`M${x - 4} ${y + 3}l2 5 2-4z`} fill={WHITE} />
    </>
  )
}

function body(kind: CreatureKind, mood: Mood, color: string): ReactNode {
  const calm = mood === "sleep" || mood === "happy"
  const fill = { fill: color, fillOpacity: calm ? 0.34 : 0.28, stroke: color, strokeWidth: 3, strokeLinejoin: "round" as const }

  switch (kind) {
    case "slime":
      return (
        <>
          <path d="M10 66C6 42 20 18 40 18s34 24 30 48q-4 6-10 0-4 8-10 0-4 8-10 0-4 8-10 0-6 6-10 0z" {...fill} />
          <ellipse cx="26" cy="30" rx="6" ry="3.5" fill="#fff" opacity=".4" transform="rotate(-30 26 30)" />
          <circle cx="16" cy="56" r="2" fill={color} opacity=".6" />
          <circle cx="62" cy="52" r="3" fill={color} opacity=".6" />
          <Eyes mood={mood} x1={30} x2={50} y={40} r={8} />
          <Mouth mood={mood} x={40} y={54} />
        </>
      )
    case "bat":
      return (
        <>
          <path d="M26 38C14 26 4 30 2 48c6-4 10-2 14 6 2-6 6-8 10-4zM54 38c12-12 22-8 24 10-6-4-10-2-14 6-2-6-6-8-10-4z" {...fill} />
          <ellipse cx="40" cy="46" rx="17" ry="19" {...fill} />
          <path d="M27 32l-3-14 11 8zM53 32l3-14-11 8z" {...fill} />
          <Eyes mood={mood} x1={33} x2={47} y={42} r={6.5} />
          <Mouth mood={mood} x={40} y={54} />
        </>
      )
    case "imp":
      return (
        <>
          <path d="M24 28C20 16 24 8 30 6c0 6 2 10 6 12zM56 28c4-12 0-20-6-22 0 6-2 10-6 12z" fill={color} stroke={INK} strokeWidth="1.5" />
          <path d="M18 40a22 20 0 0 1 44 0v10c0 4-3 6-6 6v8H24v-8c-3 0-6-2-6-6z" {...fill} />
          <path d="M30 64v-6M36 64v-6M44 64v-6M50 64v-6" stroke={color} strokeWidth="2" />
          <path d="M38 50l2-4 2 4z" fill={INK} />
          <Eyes mood={mood} x1={30} x2={50} y={38} r={7.5} />
          {mood === "worried" ? (
            <path d="M33 57q7 5 14 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          ) : (
            <Mouth mood={mood} x={40} y={58} />
          )}
        </>
      )
    case "eye": {
      const feral = mood === "feral"
      const lid = mood === "sleep" ? "M24 38Q40 52 56 38" : "M24 42Q40 26 56 42"
      return (
        <>
          <path d="M12 66V36a28 28 0 0 1 56 0v30q-5 8-9 0-4 8-9 0-5 8-10 0-5 8-9 0-4 8-9 0-6 8-10 0z" {...fill} />
          {calm ? (
            <path d={lid} fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          ) : (
            <>
              <circle cx="40" cy="38" r="15" fill={WHITE} stroke={INK} strokeWidth="2" />
              <path d="M26 36l6 1M54 36l-6 1M30 46l5-3M50 46l-5-3" stroke="#ff5f77" strokeWidth="1" opacity=".7" />
              <circle cx="40" cy="38" r="8" fill={color} stroke={INK} strokeWidth="1.5" />
              <circle cx={feral ? 40 : 42} cy="39" r={feral ? 2.2 : 4} fill={INK} />
              <circle cx="38" cy="36" r="2" fill="#fff" opacity=".8" />
              {feral && <path d="M24 24l32 6" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />}
            </>
          )}
          <path d="M16 62q-6 4-10 2M64 62q6 4 10 2" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </>
      )
    }
  }
}

export interface CreatureProps {
  kind: CreatureKind
  mood: Mood
  /** Extra class names, for size (sd-art-sm, sd-art-lg). */
  className?: string
}

/** One creature. The mood class on the inner group drives its idle motion (animations.css). */
export function Creature({ kind, mood, className }: CreatureProps) {
  const color = CREATURES[kind].color
  return (
    <svg
      className={`sd-art${className === undefined ? "" : ` ${className}`}`}
      viewBox="0 0 80 80"
      aria-hidden="true"
      focusable="false"
      data-creature={kind}
      data-mood={mood}
    >
      <g className={`sd-mood-${mood}`}>
        {mood === "worried" && <path d="M68 22q4 7 0 10-4-3 0-10z" fill="#7fd6ff" />}
        {mood === "happy" && <circle cx="40" cy="40" r="38" fill={color} opacity=".12" />}
        {body(kind, mood, color)}
      </g>
    </svg>
  )
}
