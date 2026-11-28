
//
// Pure, aria-hidden art: a two-layer town on the horizon (far roofs paler,
// as if through haze; near roofs darker, with a few lit windows that come and
// go), a bare branch hanging into the frame from the top corner, and the wet
// road in front of the houses. Colours come from scene.css (tokens only).
// Nothing here carries meaning: every state is still said by each window's
// light, glyph and word. Motion lives only in motion.css.

/** Far roofs: a spire, a water tower and flat blocks, read as one hazy shape. */
const FAR =
  "M0 160V108H38V92H66V100H104V74H128V62H150V74H168V98H214V86H256V96H296V54L308 26L320 54V96H356V82H414V104H462V76H516V88H556V66H572V52H588V66H604V90H648V100H694V72H738V60H762V72H788V94H846V82H898V100H946V70H996V90H1046V80H1096V96H1148V86H1200V160Z"

/** Near roofs: gables and chimneys, darker, just behind the street. */
const NEAR =
  "M0 160V132L30 114L60 132V126H108V120L138 102L168 120V136H228V122H252V112H260V122H262L300 106L338 126V138H398V124L428 108L458 124V134H518V116H544V104H552V116H580V132H640V124L672 106L704 124V136H760V120L790 104L820 120V130H880V118H930V136H990V122L1022 106L1054 122V132H1110V112H1120V120L1150 104L1180 120V130H1200V160Z"

/** A few far windows: [x, y, delay index]. Some go out and come back (motion.css). */
const TOWN_WINDOWS: readonly [number, number, number][] = [
  [44, 140, 0], [148, 128, 1], [190, 142, 2], [312, 140, 3], [436, 130, 4], [480, 146, 5],
  [596, 140, 6], [690, 130, 7], [806, 126, 8], [902, 140, 9], [1034, 128, 10], [1162, 136, 11],
]

export function Skyline() {
  return (
    <svg className="gh-skyline" viewBox="0 0 1200 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <path className="gh-skyline-far" d={FAR} />
      <path className="gh-skyline-near" d={NEAR} />
      {TOWN_WINDOWS.map(([x, y, i]) => (
        <rect
          key={i}
          className="gh-town-win"
          x={x}
          y={y}
          width="5"
          height="6"
          style={{ ["--i" as string]: String(i) }}
        />
      ))}
    </svg>
  )
}

/** A bare branch reaching in from the top corner: the nearest layer of the scene. */
export function Branch() {
  return (
    <svg className="gh-branch" viewBox="0 0 260 150" aria-hidden="true" focusable="false">
      <path className="gh-branch-limb" d="M-6 10C40 18 78 30 112 52S168 92 214 98" strokeWidth="9" />
      <path className="gh-branch-limb" d="M70 30C84 14 104 8 124 4" strokeWidth="4" />
      <path className="gh-branch-limb" d="M112 52C118 72 116 92 104 112" strokeWidth="4" />
      <path className="gh-branch-limb" d="M160 84C176 70 196 64 222 62" strokeWidth="3" />
      <path className="gh-branch-limb" d="M214 98C226 104 236 116 240 130" strokeWidth="2.5" />
      <path className="gh-branch-limb" d="M104 112C98 122 100 132 108 140" strokeWidth="2" />
      <path className="gh-branch-limb" d="M124 4C134 10 140 2 150 0" strokeWidth="2" />
      <path className="gh-branch-limb" d="M38 18C44 30 40 42 30 50" strokeWidth="3" />
      {/* Three dry leaves still holding on. */}
      <path className="gh-leaf" d="M222 62q8-6 14 2q-8 6-14-2z" />
      <path className="gh-leaf" d="M240 130q6-8 14-2q-6 8-14 2z" />
      <path className="gh-leaf" d="M30 50q-8 2-8 10q8-1 8-10z" />
    </svg>
  )
}

/** The road in front of the houses: kerb, wet asphalt and a dashed centre line. */
export function Road() {
  return (
    <span className="gh-road" aria-hidden="true">
      <span className="gh-road-line" />
    </span>
  )
}
