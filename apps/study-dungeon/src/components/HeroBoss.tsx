// The hero's stage: the weakest monster stands in a spotlight on a pedestal,
// with its name, a health ring and a speech bubble. With no monster, a
// dragon sleeps on its hoard. Decoration only (the hero says it in words).
//
// Written by Claude Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import type { Fact } from "../policy"
import { creatureOf, moodOf, quipOf } from "../creatures"
import { Creature } from "./art/Creature"
import { Embers } from "./art/Particles"

function SleepingDragon() {
  return (
    <svg className="sd-dragon" viewBox="0 0 160 90" aria-hidden="true" focusable="false">
      <ellipse cx="82" cy="84" rx="70" ry="5" fill="#000" opacity=".5" />
      <path d="M40 80l6-6 8 4 7-7 9 6 8-5 9 6 7-5 9 5 8-4 7 6z" fill="#c89b2c" opacity=".85" />
      <circle cx="58" cy="78" r="3" fill="#ffd76a" />
      <circle cx="96" cy="77" r="2.5" fill="#ffd76a" />
      <circle cx="112" cy="79" r="2" fill="#ffd76a" />
      <path d="M30 62c-20-2-26-18-18-26 6 4 8 8 14 8z" fill="#1f4a24" stroke="#08150a" strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="82" cy="66" rx="58" ry="17" fill="#1f4a24" stroke="#08150a" strokeWidth="3" />
      <path d="M50 52l5-12 5 12M68 49l5-13 5 13M86 49l5-13 5 13" fill="#2f6a35" stroke="#08150a" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="124" cy="58" r="15" fill="#235a2a" stroke="#08150a" strokeWidth="3" />
      <path d="M116 55q4 3 9 0" fill="none" stroke="#08150a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M132 52l8-8M124 44l2-9" stroke="#08150a" strokeWidth="3" strokeLinecap="round" />
      <text className="sd-zz" x="138" y="34" fontFamily="Pirata One, serif" fontSize="20" fill="#9cf26b">
        z
      </text>
      <text className="sd-zz sd-zz-2" x="148" y="22" fontFamily="Pirata One, serif" fontSize="14" fill="#9cf26b">
        z
      </text>
    </svg>
  )
}

/** A ring around the boss, filled to its health. */
function HealthRing({ health }: { health: number }) {
  const r = 88
  const c = 2 * Math.PI * r
  const h = Math.min(100, Math.max(0, health))
  return (
    <svg className="sd-ring" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <circle cx="100" cy="100" r={r} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="6" />
      <circle
        cx="100"
        cy="100"
        r={r}
        fill="none"
        stroke={h < 35 ? "#ff5f77" : "#ff8a2b"}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(c * h) / 100} ${c}`}
        transform="rotate(-90 100 100)"
      />
      {/* Weak and dead marks, as on every health bar. */}
      {[60, 10].map((mark) => {
        const a = ((mark / 100) * 360 - 90) * (Math.PI / 180)
        return (
          <line
            key={mark}
            x1={100 + (r - 9) * Math.cos(a)}
            y1={100 + (r - 9) * Math.sin(a)}
            x2={100 + (r + 9) * Math.cos(a)}
            y2={100 + (r + 9) * Math.sin(a)}
            stroke="#f0e6cc"
            strokeOpacity=".55"
            strokeWidth="2"
          />
        )
      })}
    </svg>
  )
}

export function HeroBoss({ boss }: { boss: Fact | undefined }) {
  if (boss === undefined) {
    return (
      <div className="sd-boss sd-boss-calm" aria-hidden="true">
        <div className="sd-boss-light" />
        <SleepingDragon />
        <p className="sd-bubble">Shh. The dungeon sleeps.</p>
      </div>
    )
  }
  const creature = creatureOf(boss.id)
  const mood = moodOf(boss.state, boss.health)
  return (
    <div className="sd-boss" data-mood={mood} aria-hidden="true" style={{ ["--boss" as string]: creature.color }}>
      <div className="sd-boss-light" />
      <Embers count={8} />
      <HealthRing health={boss.health} />
      <div className="sd-boss-figure">
        <Creature kind={creature.kind} mood={mood} className="sd-art-boss" />
      </div>
      <div className="sd-pedestal" />
      <p className="sd-bubble">{quipOf(mood)}</p>
      <p className="sd-boss-name">
        {creature.name} <span className="num">{Math.floor(boss.health)} hp</span>
      </p>
    </div>
  )
}
