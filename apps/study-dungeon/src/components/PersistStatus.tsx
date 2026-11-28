// One line about whether the browser will keep this app's data, with a button
// to ask it to (see pwa.ts). Nothing is shown when the browser cannot say.
// The ask is a click, never automatic: Firefox shows a permission prompt for it.
//

import { useState } from "react"
import { usePersistence } from "../pwa"
import "../styles/tab-banner.css"

export const persistText = {
  protected: "Your browser will not clear this data on its own.",
  atRisk: "Your browser may clear this data if the device runs low on space.",
  ask: "Keep my data",
  refused: "The browser said no. Use Back up to keep a copy in a file.",
} as const

export function PersistStatus() {
  const { state, ask } = usePersistence()
  const [asked, setAsked] = useState(false)
  if (state === "unknown" || state === "unsupported") return null
  if (state === "persisted") return <p className="sd-persist">{persistText.protected}</p>
  return (
    <p className="sd-persist">
      <span>{asked ? persistText.refused : persistText.atRisk}</span>
      {!asked && (
        <button
          type="button"
          onClick={() => {
            setAsked(true)
            ask()
          }}
        >
          {persistText.ask}
        </button>
      )}
    </p>
  )
}
