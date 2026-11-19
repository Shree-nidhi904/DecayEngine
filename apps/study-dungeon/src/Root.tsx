// What main.tsx renders (task 18.3): builds the engine safely, then the App
// inside an error boundary.
//
// - The engine loads its snapshot when it is built. A snapshot that cannot be
//   read ("corrupt") or a browser with no usable storage ("unavailable") is
//   shown on the problem screen with storageProblemText, instead of a blank
//   page. "Corrupt" offers "Reset all data", which removes exactly the app's
//   keys (RESET_KEYS) and reloads.
// - ErrorBoundary catches anything thrown while rendering, logs it and shows
//   the crash screen, which also offers the reset when storage can be used.
//
// Everything that touches the browser is injected, so tests pass a fake
// storage, a fake reload and an engine on InMemoryAdapter.

import { useState } from "react"
import { App, type AppProps } from "./App"
import type { StudyDungeonEngine } from "./engine-instance"
import { resetAllData, type FlagStorage } from "./first-run"
import { createEngineSafely, storageProblemText } from "./storage-errors"
import { ErrorBoundary, ProblemScreen, type ErrorBoundaryProps } from "./components/ErrorBoundary"

export interface RootProps {
  /** Builds the engine (main.tsx: createEngine from engine-instance.ts). Called once. */
  createEngine: () => StudyDungeonEngine
  /** The app's flags and settings, and what reset clears. Null when localStorage cannot be reached. */
  storage: FlagStorage | null
  /** Reloads the page after a reset or from the problem screen. Defaults to location.reload. */
  reload?: () => void
  /** Where a crash is reported. Defaults to console.error (ErrorBoundary). */
  log?: ErrorBoundaryProps["log"]
  /** Passed on to the App: clocks, schedulers and the rest (tests). */
  appProps?: Omit<AppProps, "engine" | "storage" | "reload">
}

const browserReload = () => globalThis.location.reload()

export function Root({ createEngine, storage, reload = browserReload, log, appProps }: RootProps) {
  const reset = storage === null ? undefined : () => resetAllData(storage, reload)
  return (
    <ErrorBoundary onReset={reset} reload={reload} log={log}>
      <LoadedApp createEngine={createEngine} storage={storage} reload={reload} reset={reset} appProps={appProps} />
    </ErrorBoundary>
  )
}

function LoadedApp({
  createEngine,
  storage,
  reload,
  reset,
  appProps,
}: {
  createEngine: () => StudyDungeonEngine
  storage: FlagStorage | null
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
  return <App {...appProps} engine={result.engine} storage={storage} reload={reload} />
}
