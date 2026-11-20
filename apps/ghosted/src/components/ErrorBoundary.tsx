// Copied from apps/study-dungeon/src/components/ErrorBoundary.tsx (Ghosted
// design section 1.3). Changed: Ghosted wording (problemScreenText in
// wording.ts), Ghosted class names and the log prefix. No import from
// apps/study-dungeon (Req 21.1).
//
// A friendly screen instead of a blank page (design section 9.1).
//
// - ProblemScreen: a plain message with "Reload" and, when the app can offer
//   it, "Reset all data". Used for storage problems found at startup
//   (see storage-errors.ts) and as ErrorBoundary's fallback.
// - ErrorBoundary: catches errors thrown while rendering, logs them, and
//   shows ProblemScreen. React only offers this as a class component.
//
// Reload and logging are injected so tests never reload the page or print.

import { Component, useState, type ErrorInfo, type ReactNode } from "react"
import { problemScreenText } from "../wording"
import "../styles/problem.css"

export { problemScreenText }

export type ProblemScreenProps = {
  /** What went wrong, in one or two plain sentences. */
  message: string
  /** Offered only when given: clears the app's stored data. Asks first. */
  onReset?: () => void
  /** Reloads the page. Defaults to window.location.reload. */
  reload?: () => void
}

const browserReload = () => globalThis.location.reload()

export function ProblemScreen({ message, onReset, reload = browserReload }: ProblemScreenProps) {
  const [confirming, setConfirming] = useState(false)
  return (
    <main className="gh-problem" role="alert" aria-labelledby="gh-problem-title">
      <h1 id="gh-problem-title">{problemScreenText.title}</h1>
      <p>{message}</p>
      {confirming && onReset !== undefined ? (
        <div className="gh-problem-actions">
          <p>{problemScreenText.confirmReset}</p>
          <button type="button" className="gh-button" autoFocus onClick={() => setConfirming(false)}>
            {problemScreenText.cancel}
          </button>
          <button type="button" className="gh-button gh-button-danger" onClick={onReset}>
            {problemScreenText.confirm}
          </button>
        </div>
      ) : (
        <div className="gh-problem-actions">
          <button type="button" className="gh-button gh-button-primary" onClick={reload}>
            {problemScreenText.reload}
          </button>
          {onReset !== undefined && (
            <button type="button" className="gh-button" onClick={() => setConfirming(true)}>
              {problemScreenText.reset}
            </button>
          )}
        </div>
      )}
    </main>
  )
}

export type ErrorBoundaryProps = {
  children: ReactNode
  /** Offered on the fallback screen when given. */
  onReset?: () => void
  /** Defaults to window.location.reload. */
  reload?: () => void
  /** Where the error is reported. Defaults to console.error. */
  log?: (error: unknown, info: ErrorInfo) => void
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    const log = this.props.log ?? ((e: unknown, i: ErrorInfo) => console.error("Ghosted crashed:", e, i.componentStack))
    log(error, info)
  }

  override render() {
    if (this.state.failed) {
      return (
        <ProblemScreen
          message={problemScreenText.crashed}
          onReset={this.props.onReset}
          reload={this.props.reload}
        />
      )
    }
    return this.props.children
  }
}
