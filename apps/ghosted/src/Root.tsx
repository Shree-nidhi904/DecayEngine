// Copied from apps/study-dungeon/src/Root.tsx (Ghosted design section 1.3).
// Changed: createEngine returns a GhostedEngine, and the new `session` prop
// (the splash flag's sessionStorage) is passed on to the App. Otherwise the
// same structure. No import from apps/study-dungeon (Req 21.1).
//
// What main.tsx renders: builds the engine safely, then the App inside an
// error boundary (design section 9.1).
//
// - The engine loads its snapshot when it is built. A snapshot that cannot be
//   read ("corrupt") or a browser with no usable storage ("unavailable") is
//   shown on the problem screen with storageProblemText, instead of a blank
//   page. "Corrupt" offers "Reset all data", which removes exactly Ghosted's
//   keys (RESET_KEYS) and reloads.
// - ErrorBoundary catches anything thrown while rendering, logs it and shows
//   the crash screen, which also offers the reset when storage can be used.
//
// Everything that touches the browser is injected, so tests pass a fake
// storage, a fake reload and an engine on InMemoryAdapter.

import { useState } from "react"
import { App, type AppProps } from "./App"
import type { GhostedEngine } from "./engine-instance"
import { resetAllData, type FlagStorage } from "./first-run"
import type { SessionFlagStorage } from "./splash"
import { createEngineSafely, storageProblemText } from "./storage-errors"
import { ErrorBoundary, ProblemScreen, type ErrorBoundaryProps } from "./components/ErrorBoundary"

export interface RootProps {
  /** Builds the engine (main.tsx: createEngine from engine-instance.ts). Called once. */
  createEngine: () => GhostedEngine
  /** The app's flags, and what reset clears. Null when localStorage cannot be reached. */
  storage: FlagStorage | null
  /** The splash flag's storage (window.sessionStorage), or null when it cannot be reached. */
  session: SessionFlagStorage | null
  /** Reloads the page after a reset or from the problem screen. Defaults to location.reload. */
  reload?: () => void
  /** Where a crash is reported. Defaults to console.error (ErrorBoundary). */
  log?: ErrorBoundaryProps["log"]
  /** Passed on to the App: clocks, schedulers and the rest (tests). */
  appProps?: Omit<AppProps, "engine" | "storage" | "session" | "reload">
}

const browserReload = () => globalThis.location.reload()

export function Root({ createEngine, storage, session, reload = browserReload, log, appProps }: RootProps) {
  const reset = storage === null ? undefined : () => resetAllData(storage, reload)
  return (
    <ErrorBoundary onReset={reset} reload={reload} log={log}>
      <LoadedApp
        createEngine={createEngine}
        storage={storage}
        session={session}
        reload={reload}
        reset={reset}
        appProps={appProps}
      />
    </ErrorBoundary>
  )
}

function LoadedApp({
  createEngine,
  storage,
  session,
  reload,
  reset,
  appProps,
}: {
  createEngine: () => GhostedEngine
  storage: FlagStorage | null
  session: SessionFlagStorage | null
  reload: () => void
  reset: (() => void) | undefined
  appProps: RootProps["appProps"]
}) {
  // Built once. Errors that are not storage problems are rethrown by
  // createEngineSafely and reach the ErrorBoundary above.
  const [result] = useState(() => createEngineSafely(createEngine))

  if (!result.ok) {
    return (
      <ProblemScreen
        message={storageProblemText[result.problem]}
        onReset={result.problem === "corrupt" ? reset : undefined}
        reload={reload}
      />
    )
  }
  // The engine loaded, but the flags cannot be stored: nothing could be saved.
  if (storage === null) {
    return <ProblemScreen message={storageProblemText.unavailable} reload={reload} />
  }
  return <App {...appProps} engine={result.engine} storage={storage} session={session} reload={reload} />
}
