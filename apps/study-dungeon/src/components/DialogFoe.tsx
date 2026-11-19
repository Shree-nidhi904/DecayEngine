// The creature at the top of the fight and the challenge (visual pass,
// Pass 3): its name, a line it says, and its mood. `fx` names a one-off
// motion in animations.css (popin, squish, rise, lunge); none under reduced
// motion. Decoration: the dialog's title and result text say it in words.
//
// Written by Claude Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import type { Fact } from "../policy"
import { creatureOf, type Mood } from "../creatures"
import { Creature } from "./art/Creature"

export type FoeFx = "popin" | "squish" | "rise" | "lunge"

export function DialogFoe({ fact, mood, quip, fx }: { fact: Fact; mood: Mood; quip: string; fx: FoeFx }) {
  const creature = creatureOf(fact.id)
  return (
    <div className="sd-foe" data-fx={fx}>
      <div className="sd-foe-art" key={fx}>
        <Creature kind={creature.kind} mood={mood} className="sd-art-lg" />
      </div>
      <p className="sd-foe-words">
        <span className="sd-foe-name">{creature.name}</span>
        <span className="sd-quip">{quip}</span>
      </p>
    </div>
  )
}
