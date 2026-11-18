import { useCallback, useState } from "react"
import { engine } from "./engine-instance"
import { useSettleTicks } from "./ticking"
import type { Fact } from "./policy"
import { ThreeLists, type FactAction } from "./components/ThreeLists"
import { AddEditFactDialog } from "./components/AddEditFactDialog"
import { FightDialog } from "./components/FightDialog"
import { ChallengeDialog } from "./components/ChallengeDialog"
import { factFormText } from "./wording"
import "./styles/dialogs.css"

// Every write uses the real time (design.md, Normal Mode). The app may read
// the clock; the engine never does.
const writeNow = () => Date.now()

/** The one dialog open at a time, if any. */
type OpenDialog =
  | { kind: "add" }
  | { kind: "edit"; fact: Fact }
  | { kind: "fight"; fact: Fact }
  | { kind: "challenge"; fact: Fact }

export function App() {
  // The clock, refreshed every minute by the settle ticks below.
  const [realNow, setRealNow] = useState(() => Date.now())

  // PLACEHOLDER, round 5 (task 8.1): becomes state set by the time machine.
  // 0 means today. Writes are blocked when it is above 0.
  const previewOffsetMs: number = 0
  const previewing = previewOffsetMs > 0
  const now = realNow + previewOffsetMs

  // Bumped after every write, so the lists read engine.view(now) again.
  const [version, setVersion] = useState(0)
  const bumpVersion = useCallback(() => setVersion((v) => v + 1), [])

  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const closeDialog = useCallback(() => setDialog(null), [])

  // Ticks on mount and every minute while not previewing; each tick's time
  // becomes the new realNow, so reads and saved settling use the same moment.
  useSettleTicks(engine, previewing, setRealNow)

  const handleRemove = useCallback(
    (id: string) => {
      if (previewing) return
      engine.remove(id)
      bumpVersion()
    },
    [previewing, bumpVersion]
  )

  const handleAction = useCallback(
    (fact: Fact, action: FactAction) => {
      if (previewing) return
      setDialog(action === "tend" ? { kind: "fight", fact } : { kind: "challenge", fact })
    },
    [previewing]
  )

  const handleEdit = useCallback(
    (fact: Fact) => {
      if (previewing) return
      setDialog({ kind: "edit", fact })
    },
    [previewing]
  )

  return (
    <main className="sd-app">
      <h1>Study Dungeon</h1>
      <p>Facts you are forgetting come back as monsters.</p>

      <div className="sd-toolbar">
        <button
          type="button"
          className="sd-button sd-button-primary"
          disabled={previewing}
          onClick={() => setDialog({ kind: "add" })}
        >
          {factFormText.addEntry}
        </button>
      </div>

      <ThreeLists
        engine={engine}
        now={now}
        version={version}
        onAction={handleAction}
        onEdit={handleEdit}
        onRemove={handleRemove}
      />

      {dialog?.kind === "add" && (
        <AddEditFactDialog engine={engine} now={writeNow} onSaved={bumpVersion} onClose={closeDialog} />
      )}
      {dialog?.kind === "edit" && (
        <AddEditFactDialog
          key={dialog.fact.id}
          engine={engine}
          now={writeNow}
          fact={dialog.fact}
          onSaved={bumpVersion}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "fight" && (
        <FightDialog
          key={dialog.fact.id}
          engine={engine}
          now={writeNow}
          fact={dialog.fact}
          onWrite={bumpVersion}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === "challenge" && (
        <ChallengeDialog
          key={dialog.fact.id}
          engine={engine}
          now={writeNow}
          fact={dialog.fact}
          onWrite={bumpVersion}
          onClose={closeDialog}
        />
      )}
    </main>
  )
}
