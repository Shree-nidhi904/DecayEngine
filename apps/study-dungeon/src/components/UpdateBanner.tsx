// A bar that says a new version is ready, with an Update button (see pwa.ts).
//

import "../styles/tab-banner.css"

export const updateReadyText = {
  message: "A new version of Study Dungeon is ready.",
  update: "Update",
} as const

export function UpdateBanner({ apply }: { apply: () => void }) {
  return (
    <div className="sd-tab-banner" role="status">
      <span>{updateReadyText.message}</span>
      <button type="button" onClick={apply}>
        {updateReadyText.update}
      </button>
    </div>
  )
}
