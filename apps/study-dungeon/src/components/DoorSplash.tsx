// The entrance from the wireframe: two iron-banded doors swing open onto the
// dungeon. Shown once per browser tab (sessionStorage), opened by the button
// or by itself after a few seconds. Skipped entirely under reduced motion.
// Rendered by main.tsx beside the app, so the app and its tests never see it.
//
// Written by - Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { useEffect, useRef, useState } from "react"
import { doorText } from "../wording"
import { Torch } from "./art/Scenery"

const SEEN_KEY = "study-dungeon:door-seen"

function shouldShow(): boolean {
  try {
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false
    return globalThis.sessionStorage?.getItem(SEEN_KEY) !== "1"
  } catch {
    return false
  }
}

export function DoorSplash() {
  const [stage, setStage] = useState<"closed" | "open" | "gone">(() => (shouldShow() ? "closed" : "gone"))
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (stage !== "closed") return
    button.current?.focus()
    const auto = setTimeout(() => setStage("open"), 4500)
    return () => clearTimeout(auto)
  }, [stage])

  useEffect(() => {
    if (stage !== "open") return
    try {
      globalThis.sessionStorage?.setItem(SEEN_KEY, "1")
    } catch {
      // Then the door simply shows again next time.
    }
    const done = setTimeout(() => setStage("gone"), 1600)
    return () => clearTimeout(done)
  }, [stage])

  if (stage === "gone") return null
  return (
    <div className="sd-door" data-stage={stage}>
      <div className="sd-door-leaf sd-door-left" aria-hidden="true" />
      <div className="sd-door-leaf sd-door-right" aria-hidden="true" />
      <div className="sd-door-ui">
        <div className="sd-door-torches" aria-hidden="true">
          <Torch />
          <Torch />
        </div>
        <p className="sd-door-title">{doorText.title}</p>
        <p className="sd-door-line">{doorText.line}</p>
        <button ref={button} type="button" className="sd-door-enter" onClick={() => setStage("open")}>
          {doorText.enter}
        </button>
      </div>
    </div>
  )
}
