// One person's card in a modal dialog (task 4.7, design sections 4.4 and
// 9.4; Req 10.4, 24.2, 24.3). Opened from a Street window and a Still lit
// row's Open button.
//
// A native modal <dialog> through useModalDialog: focus opens on the card's
// heading (an h2 with tabindex -1), stays inside, Escape and Close close it,
// and focus goes back to the window or row that opened it. The card's own
// buttons chain to the next dialog (Reach out, Reconnect, Edit, Remove,
// Autopsy), which takes over this dialog's opener. Engine calls: history
// (through PersonCard).

import type { HistoryEntry } from "@decay-engine/engine"
import type { GhostedEngine } from "../engine-instance"
import type { BlockedReason } from "../lists"
import type { Person } from "../policy"
import { dialogText } from "../wording"
import { PersonCard, type PersonActions } from "./PersonCard"
import { useModalDialog } from "./useModalDialog"
import "../styles/layout.css"
import "../styles/dialogs.css"

export interface PersonDialogProps {
  /** Settled at `now`. */
  person: Person
  now: number
  /** StreetView.darkAt.get(id) ?? null. */
  darkAt: number | null
  engine: Pick<GhostedEngine, "history">
  /** engine.history(id), read once per version by the App. */
  history: readonly HistoryEntry[]
  blocked: BlockedReason
  formatDate: (ms: number) => string
  actions: PersonActions
  /** Close and Escape. */
  onClose: () => void
}

export function PersonDialog({ person, now, darkAt, engine, history, blocked, formatDate, actions, onClose }: PersonDialogProps) {
  const ref = useModalDialog()

  return (
    <dialog
      ref={ref}
      className="gh-dialog gh-dialog-person"
      aria-label={person.payload.name}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <PersonCard
        person={person}
        now={now}
        darkAt={darkAt}
        engine={engine}
        history={history}
        blocked={blocked}
        formatDate={formatDate}
        headingLevel={2}
        focusHeading
        {...actions}
      />
      <div className="gh-dialog-actions">
        <button type="button" className="gh-button" data-action="close" onClick={onClose}>
          {dialogText.close}
        </button>
      </div>
    </dialog>
  )
}
