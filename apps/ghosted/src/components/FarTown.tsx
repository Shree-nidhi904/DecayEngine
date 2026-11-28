// The far background (feedback list, points 9 and 19): stars over the whole
// page, and on wide screens a far row of houses and trees in each side
// margin, where the page leaves room (sheet.css shows them from 1280px).
// Scenery only: aria-hidden, no pointer events, CSS and SVG only.

/** One far house: x, width, height, and which of its two windows are dark. */
const HOUSES: readonly { x: number; w: number; h: number; off: readonly boolean[] }[] = [
  { x: 4, w: 40, h: 70, off: [false, true] },
  { x: 52, w: 32, h: 104, off: [true, false] },
  { x: 92, w: 44, h: 60, off: [false, false] },
  { x: 146, w: 30, h: 88, off: [true, true] },
]

function Side({ side }: { side: "left" | "right" }) {
  return (
    <div className="gh-far-side" data-side={side}>
      <svg viewBox="0 0 180 200" preserveAspectRatio="xMidYMax meet" focusable="false">
        <path className="gh-far-tree" d="M140 200V150l-14 14 10-24-16 8 20-34 20 34-16-8 10 24-14-14v50z" />
        {HOUSES.map((house) => (
          <g key={house.x}>
            <path
              className="gh-far-house"
              d={`M${house.x} 200V${200 - house.h}l${house.w / 2} -14 ${house.w / 2} 14V200z`}
            />
            {house.off.map((off, i) => (
              <rect
                key={i}
                className="gh-far-window"
                data-off={off ? "" : undefined}
                x={house.x + 6 + i * (house.w / 2 - 2)}
                y={200 - house.h + 14}
                width={Math.max(6, house.w / 2 - 12)}
                height={10}
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
}

export function FarTown() {
  return (
    <div className="gh-far-town" aria-hidden="true">
      <Side side="left" />
      <Side side="right" />
    </div>
  )
}
