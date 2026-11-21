// The splash (task 4.14, design section 4.4 Splash; Req 6.1-6.4, 24.2,
// 25.1). Ported from the wireframe's .splash: six windows light up one by
// one, then the word "Ghosted" in Monoton and one primary "Walk in".
//
// A full-screen modal <dialog aria-label="Ghosted"> through useModalDialog:
// focus opens on the tagline (tabindex -1), never on the button (Req 24.2),
// and Escape does the same as "Walk in". The word is a <p aria-hidden>: the
// page's only h1 is the header sign (Req 7.4). The light-up is CSS only,
// inside prefers-reduced-motion: no-preference (motion.css); the App never
// renders the splash under reduced motion (shouldShowSplash, Req 6.3).
// Engine calls: none.

import { appText, splashText } from "../wording"
import { useModalDialog } from "./useModalDialog"
import { Window } from "./Window"
import "../styles/layout.css"
import "../styles/sign.css"

export interface SplashProps {
  /** "Walk in" or Escape. The App marks the splash seen and focuses the hero heading. */
  onDone: () => void
}

/** The number of windows that light up (Req 6.1). */
export const SPLASH_WINDOWS = 6

export function Splash({ onDone }: SplashProps) {
  const ref = useModalDialog()

  return (
    <dialog
      ref={ref}
      className="gh-splash"
      aria-label={appText.name}
      onCancel={(event) => {
        event.preventDefault()
        onDone()
      }}
    >
      <div className="gh-splash-in">
        <div className="gh-splash-windows" aria-hidden="true">
          {Array.from({ length: SPLASH_WINDOWS }, (_, i) => (
            <Window key={i} health={100} state="alive" size="splash" />
          ))}
        </div>
        <p className="gh-splash-word" aria-hidden="true">
          {appText.name}
        </p>
        <p className="gh-splash-tagline" tabIndex={-1} data-autofocus>
          {splashText.tagline}
        </p>
        <button type="button" className="gh-button gh-button-primary gh-splash-enter" onClick={onDone}>
          {splashText.walkIn}
        </button>
      </div>
    </dialog>
  )
}
