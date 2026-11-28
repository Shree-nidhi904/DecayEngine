// The empty side margins on wide screens (feedback list, point 9): a stone pillar
// each side with hanging chains and a wall torch, in the world's own style. Pure
// decoration: hidden from assistive technology, never in the way of a click, and
// shown only where the page leaves room (backdrop.css, 1280px and wider; App.tsx imports it after world.css).


function Side({ side }: { side: "left" | "right" }) {
  return (
    <div className={`sd-margin sd-margin-${side}`} aria-hidden="true">
      <span className="sd-chain sd-chain-a" />
      <span className="sd-chain sd-chain-b" />
      <span className="sd-wall-torch">
        <span className="sd-wall-torch-glow" />
        <span className="sd-wall-torch-flame" />
        <span className="sd-wall-torch-stick" />
      </span>
      <span className="sd-chain sd-chain-c" />
    </div>
  )
}

export function Margins() {
  return (
    <>
      <Side side="left" />
      <Side side="right" />
    </>
  )
}
