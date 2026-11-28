// A bar that says another tab changed the saved data, with a Reload button.
// Shown by Root (see cross-tab.ts).
//

import "../styles/tab-banner.css"

export const tabChangedText = {
  message: "Another tab changed your Ghosted data. Reload to see the latest before you make changes.",
  reload: "Reload",
} as const

export function TabChangedBanner({ reload }: { reload: () => void }) {
  return (
    <div className="gh-tab-banner" role="status">
      <span>{tabChangedText.message}</span>
      <button type="button" onClick={reload}>
        {tabChangedText.reload}
      </button>
    </div>
  )
}
