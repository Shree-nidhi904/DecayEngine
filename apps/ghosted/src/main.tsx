// Copied from apps/study-dungeon/src/main.tsx (Ghosted design section 1.3).
// Changed: Ghosted's fonts and styles, the session storage for the splash
// flag, and no door splash (Ghosted's splash is part of the App, task 4.14).
// No import from apps/study-dungeon (Req 21.1).
//
// Fonts are bundled through @fontsource; nothing loads from another origin
// (Req 23.2, 30.2).

import React from "react"
import { createRoot } from "react-dom/client"
import { Root } from "./Root"
import { createEngine } from "./engine-instance"
import type { FlagStorage } from "./first-run"
import type { SessionFlagStorage } from "./splash"
import "@fontsource/monoton/400.css"
import "@fontsource/josefin-sans/400.css"
import "@fontsource/josefin-sans/600.css"
import "@fontsource/spectral/400.css"
import "@fontsource/spectral/400-italic.css"
import "@fontsource/spectral/600.css"
import "@fontsource/ibm-plex-mono/400.css"
import "@fontsource/ibm-plex-mono/500.css"
import "./styles/tokens.css"
import "./styles/global.css"

const rootElement = document.getElementById("root")
if (rootElement === null) {
  throw new Error('Ghosted: no element with id "root" found in index.html.')
}

/** window.localStorage, or null when the browser blocks it (reading it can throw). */
function browserStorage(): FlagStorage | null {
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

/** window.sessionStorage, or null when the browser blocks it (reading it can throw). */
function browserSession(): SessionFlagStorage | null {
  try {
    return window.sessionStorage ?? null
  } catch {
    return null
  }
}

// The engine is built inside Root through createEngineSafely, so a damaged
// snapshot shows the problem screen instead of a blank page (design section 9.1).
createRoot(rootElement).render(
  <React.StrictMode>
    <Root createEngine={createEngine} storage={browserStorage()} session={browserSession()} />
  </React.StrictMode>
)
