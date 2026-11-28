// The buttons in the top right corner (feedback list, points 7, 17 and 20):
// Home (the landing page), Settings, and the account button. Signed out it
// reads "Sync"; once signed in it reads "Profile" and opens the activity
// history. Icons are inline SVG with a visible word beside each.
import { topBarText } from "../wording"

export const HOME_URL = "https://decay-engine.pages.dev/"

export interface TopBarProps {
  onSettings: () => void
  onProfile: () => void
  /** The signed-in email, or null when signed out. */
  signedInAs: string | null
}

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path d="M3 11 12 4l9 7M6 10v10h4v-6h4v6h4V10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
)
const GearIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
    <path
      d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)
const PersonIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

export function TopBar({ onSettings, onProfile, signedInAs }: TopBarProps) {
  return (
    <nav className="sd-topbar" aria-label={topBarText.label}>
      <a className="sd-topbar-button" href={HOME_URL}>
        <HomeIcon />
        <span>{topBarText.home}</span>
      </a>
      <button type="button" className="sd-topbar-button" onClick={onSettings} aria-haspopup="dialog">
        <GearIcon />
        <span>{topBarText.settings}</span>
      </button>
      <button
        type="button"
        className="sd-topbar-button sd-topbar-account"
        onClick={onProfile}
        aria-haspopup="dialog"
        title={signedInAs === null ? topBarText.syncHint : topBarText.signedInAs(signedInAs)}
        data-signed-in={signedInAs === null ? undefined : ""}
      >
        <PersonIcon />
        <span>{signedInAs === null ? topBarText.sync : topBarText.profile}</span>
      </button>
    </nav>
  )
}
