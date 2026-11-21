// Feature: ghosted, Property 12 (app level): a preview never writes (task 5.5;
// design section 7.3; Req 12.5, 8.5, 19.5). The gate half is in
// write-guard.properties.test.ts.
//
// For any offset of the moon-clock dock above 0 and any write action from
// WRITE_ACTIONS, trying that action on the sample street saves nothing: the
// RecordingAdapter counts no save, the stored snapshot and the FlagStorage
// contents are byte-for-byte what they were, and the control that was tried
// is aria-disabled with "Future preview · nothing is saved".
//
// Two kinds of action are tried:
// - the control itself during the preview (Add a person, Edit, Remove, Reach
//   out, Reconnect, Restore, Import, Reset all data, Triage's start, today's
//   5-minute action, the hero's primary button, and on a first run Load
//   sample street and Start empty);
// - a dialog or form opened at today, before the dock moved, then confirmed
//   during the preview (each contact kind in Reach out and in Reconnect, Save
//   in the add and edit forms, Import, and the confirmations of Remove,
//   Restore and Reset). This is the case runGatedWrite exists for (design
//   open issue 2.3): the App reads `previewing` at the moment of the write.
//   Confirm and Save buttons are not aria-disabled, so for these the check is
//   that the write was refused with the blocked reason.
//
// The App is rendered once per run on a fresh copy of the sample snapshot,
// with a fixed clock and a tick scheduler that never fires. The test sets its
// own per-test timeout of 120 s and keeps numRuns at 100 (design open
// issue 3.4).

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import fc from "fast-check"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { InMemoryAdapter, type StoredSnapshot } from "@decay-engine/engine"
import { ANNOUNCER_ID, App } from "./App"
import { makeBackup } from "./backup"
import { ENGINE_STORAGE_KEY, STARTED_FLAG } from "./first-run"
import { loadSampleData } from "./sample-data"
import type { Scheduler } from "./ticking"
import { backupText, ghostedWording, importDialogText, personFormText, previewBlockedText } from "./wording"
import { FakeStorage } from "./test/fake-storage"
import { T0, counterIds, makeEngine } from "./test/fixtures"
import { RecordingAdapter } from "./test/recording-adapter"

afterEach(cleanup)

const HOUR_MS = 3_600_000
const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }

/** The sample street, replayed once at T0 and copied into each run's adapter. */
const SAMPLE_SNAPSHOT: string = (() => {
  const adapter = new InMemoryAdapter()
  loadSampleData(makeEngine(adapter), T0)
  return JSON.stringify(adapter.load())
})()

/** A valid Ghosted backup of the sample street (12 people). */
const BACKUP_TEXT: string = makeBackup(new FakeStorage({ [ENGINE_STORAGE_KEY]: SAMPLE_SNAPSHOT }), new Date(T0))!

/** A RecordingAdapter that already holds `snapshot`, with its save count still at 0. */
function adapterHolding(snapshot: string | null): RecordingAdapter {
  const adapter = new RecordingAdapter()
  if (snapshot !== null) InMemoryAdapter.prototype.save.call(adapter, JSON.parse(snapshot) as StoredSnapshot)
  return adapter
}

type Ctx = { target: number; reload: ReturnType<typeof vi.fn> }

type WriteAction = {
  name: string
  /** The sample street (started), or a first run (no people, no flags). */
  start: "sample" | "first-run"
  /** The control only exists while someone can take it: the offset is kept within this many days. */
  maxDays?: number
  /** At today, before the dock moves: opens a dialog or fills a form. */
  before?: (ctx: Ctx) => void | Promise<void>
  /** During the preview: tries the write. Returns the controls that must be aria-disabled with the reason. */
  attempt: (ctx: Ctx) => HTMLElement[] | Promise<HTMLElement[]>
  /** No dialog may be open afterwards (the control opened nothing). */
  opensNothing?: boolean
  /** The write was refused and the reason was said: in the live region, or inside the open form. */
  refusal?: "announced" | "in-dialog"
}

const lists = () => document.querySelector<HTMLElement>(".gh-lists")!
const toolbar = () => document.querySelector<HTMLElement>(".gh-toolbar")!
const openDialog = () => document.querySelector<HTMLDialogElement>("dialog[open]")
const announcer = () => document.getElementById(ANNOUNCER_ID)!.textContent

/** The `data-action` buttons inside `scope`. */
function buttons(scope: ParentNode, action: string): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(`button[data-action="${action}"]`)]
}

/** One of `list`, chosen by the generated target. */
function pick<T>(list: readonly T[], target: number, what: string): T {
  expect(list.length, `there is at least one ${what}`).toBeGreaterThan(0)
  return list[target % list.length]!
}

/** Clicks the control and returns it. */
function press(el: HTMLElement): HTMLElement[] {
  fireEvent.click(el)
  return [el]
}

/** Opens a card's dialog at today: Reach out, Reconnect, Edit or Remove. */
function openFromCard(action: string, ctx: Ctx): void {
  fireEvent.click(pick(buttons(lists(), action), ctx.target, `${action} button`))
  expect(openDialog(), `${action} opened a dialog at today`).not.toBeNull()
}

/** Gives the restore input a valid backup file and waits for the confirmation. */
function chooseBackupFile(): void {
  const input = document.querySelector<HTMLInputElement>('input[data-input="restore"]')!
  fireEvent.change(input, { target: { files: [new File([BACKUP_TEXT], "ghosted-backup.json", { type: "application/json" })] } })
}

/** Lets a FileReader started by a change event finish (if one was started at all). */
async function settleFileReads(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

const KINDS = ["text", "call", "meetup"] as const

const WRITE_ACTIONS: readonly WriteAction[] = [
  {
    name: "Add a person (toolbar)",
    start: "sample",
    attempt: () => press(buttons(toolbar(), "add")[0]!),
    opensNothing: true,
  },
  {
    name: "Save in the add form opened at today",
    start: "sample",
    before: () => {
      fireEvent.click(buttons(toolbar(), "add")[0]!)
      const dialog = screen.getByRole("dialog", { name: personFormText.addTitle })
      fireEvent.change(within(dialog).getByLabelText(personFormText.name), { target: { value: "Mira Castell" } })
      fireEvent.change(within(dialog).getByLabelText(personFormText.rhythm), { target: { value: "30" } })
    },
    attempt: () => {
      fireEvent.click(within(openDialog()!).getByRole("button", { name: personFormText.save }))
      return []
    },
    refusal: "in-dialog",
  },
  {
    name: "Edit (card)",
    start: "sample",
    attempt: ({ target }) => press(pick(buttons(lists(), "edit"), target, "Edit button")),
    opensNothing: true,
  },
  {
    name: "Save in the edit form opened at today",
    start: "sample",
    before: (ctx) => {
      openFromCard("edit", ctx)
      const rhythm = within(openDialog()!).getByLabelText(personFormText.rhythm) as HTMLInputElement
      fireEvent.change(rhythm, { target: { value: rhythm.value === "200" ? "201" : "200" } })
    },
    attempt: () => {
      fireEvent.click(within(openDialog()!).getByRole("button", { name: personFormText.save }))
      return []
    },
    refusal: "in-dialog",
  },
  {
    name: "Remove (card)",
    start: "sample",
    attempt: ({ target }) => press(pick(buttons(lists(), "remove"), target, "Remove button")),
    opensNothing: true,
  },
  {
    name: "Remove, confirmed after the dock moved",
    start: "sample",
    before: (ctx) => openFromCard("remove", ctx),
    attempt: () => {
      fireEvent.click(buttons(openDialog()!, "confirm")[0]!)
      return []
    },
    opensNothing: true,
    refusal: "announced",
  },
  {
    name: "Reach out (card)",
    start: "sample",
    maxDays: 100,
    attempt: ({ target }) => press(pick(buttons(lists(), "reach-out"), target, "Reach out button")),
    opensNothing: true,
  },
  ...KINDS.map(
    (kind): WriteAction => ({
      name: `Reach out by ${kind} in a dialog opened at today`,
      start: "sample",
      before: (ctx) => openFromCard("reach-out", ctx),
      attempt: () => press(openDialog()!.querySelector<HTMLElement>(`.gh-choice[data-kind="${kind}"]`)!),
    })
  ),
  {
    name: "Reconnect (card)",
    start: "sample",
    attempt: ({ target }) => press(pick(buttons(lists(), "reconnect"), target, "Reconnect button")),
    opensNothing: true,
  },
  ...KINDS.map(
    (kind): WriteAction => ({
      name: `Reconnect by ${kind} in a dialog opened at today`,
      start: "sample",
      before: (ctx) => openFromCard("reconnect", ctx),
      attempt: () => press(openDialog()!.querySelector<HTMLElement>(`.gh-choice[data-kind="${kind}"]`)!),
    })
  ),
  {
    name: "Restore (button, and a valid file chosen anyway)",
    start: "sample",
    attempt: async () => {
      const controls = press(buttons(toolbar(), "restore")[0]!)
      chooseBackupFile()
      await settleFileReads()
      return controls
    },
    opensNothing: true,
  },
  {
    name: "Restore, confirmed after the dock moved",
    start: "sample",
    before: async () => {
      chooseBackupFile()
      await screen.findByRole("dialog", { name: backupText.confirm(12) })
    },
    attempt: () => {
      fireEvent.click(within(openDialog()!).getByRole("button", { name: backupText.confirmLabel }))
      return []
    },
    opensNothing: true,
    refusal: "announced",
  },
  {
    name: "Import people (toolbar)",
    start: "sample",
    attempt: () => press(buttons(toolbar(), "import")[0]!),
    opensNothing: true,
  },
  {
    name: "Import, submitted in a dialog opened at today",
    start: "sample",
    before: () => {
      fireEvent.click(buttons(toolbar(), "import")[0]!)
      const dialog = screen.getByRole("dialog", { name: importDialogText.title })
      fireEvent.change(within(dialog).getByLabelText(importDialogText.label), {
        target: { value: "Mira Castell | Cousin | 30\nAna Ruiz | Work | 14" },
      })
    },
    attempt: () => {
      fireEvent.click(within(openDialog()!).getByRole("button", { name: importDialogText.submit }))
      return []
    },
    refusal: "in-dialog",
  },
  {
    name: "Reset all data (toolbar)",
    start: "sample",
    attempt: () => press(buttons(toolbar(), "reset")[0]!),
    opensNothing: true,
  },
  {
    name: "Reset all data, confirmed after the dock moved",
    start: "sample",
    before: () => {
      fireEvent.click(buttons(toolbar(), "reset")[0]!)
      expect(openDialog()).not.toBeNull()
    },
    attempt: () => {
      fireEvent.click(buttons(openDialog()!, "confirm")[0]!)
      return []
    },
    opensNothing: true,
    refusal: "announced",
  },
  {
    name: "Triage's start session",
    start: "sample",
    maxDays: 100,
    attempt: () =>
      press(
        within(document.querySelector<HTMLElement>(".gh-triage")!).getByRole("button", {
          name: ghostedWording.triage.startSession,
        })
      ),
    opensNothing: true,
  },
  {
    name: "Today's 5-minute action",
    start: "sample",
    // Dan Okafor, the only fading person with 5 minutes or less, goes dark 25.5 days after T0.
    maxDays: 25,
    attempt: () => press(document.querySelector<HTMLElement>('.gh-triage button[data-action="five-minute"]')!),
    opensNothing: true,
  },
  {
    name: "The hero's primary button",
    start: "sample",
    attempt: () => press(document.querySelector<HTMLElement>('[data-hero-action="primary"]')!),
    opensNothing: true,
  },
  {
    name: "Load sample street (first run)",
    start: "first-run",
    attempt: () => press(screen.getByRole("button", { name: "Load sample street" })),
    opensNothing: true,
  },
  {
    name: "Start empty (first run)",
    start: "first-run",
    attempt: () => press(screen.getByRole("button", { name: "Start empty" })),
    opensNothing: true,
  },
]

/** The offset for this action: whole hours, kept within the action's days when it has a limit. */
function offsetFor(action: WriteAction, hours: number): number {
  const limit = action.maxDays === undefined ? undefined : action.maxDays * 24
  return (limit === undefined ? hours : 1 + ((hours - 1) % limit)) * HOUR_MS
}

describe("Property 12 at the app level: a preview never writes", () => {
  it("lists every write control of Req 12.5 and design section 4.2", () => {
    const names = WRITE_ACTIONS.map((a) => a.name)
    for (const word of ["Add", "Edit", "Remove", "Reach out", "Reconnect", "Restore", "Import", "Load sample", "Start empty", "Reset", "start session", "5-minute", "hero"]) {
      expect(names.some((n) => n.includes(word)), word).toBe(true)
    }
  })

  // Feature: ghosted, Property 12: Preview never writes
  it(
    "for any offset above 0 and any write action, nothing reaches the engine or storage",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // 1 hour to 365 days, in whole hours (the slider's step).
            hours: fc.integer({ min: 1, max: 365 * 24 }),
            action: fc.constantFrom(...WRITE_ACTIONS),
            target: fc.nat({ max: 1000 }),
          }),
          async ({ hours, action, target }) => {
            cleanup()
            const adapter = adapterHolding(action.start === "sample" ? SAMPLE_SNAPSHOT : null)
            const storage = new FakeStorage(action.start === "sample" ? { [STARTED_FLAG]: "1" } : {})
            const reload = vi.fn()
            // New ids never clash with the sample's p1 … p12, so a write that slipped through would show as a save.
            const engine = makeEngine(adapter, counterIds("new"))
            const { container } = render(
              <App
                engine={engine}
                storage={storage}
                session={null}
                clock={() => T0}
                tickScheduler={idleScheduler}
                prefersReducedMotion={() => true}
                timeZone="UTC"
                reload={reload}
              />
            )
            const ctx: Ctx = { target, reload }
            await action.before?.(ctx)

            // What is stored right before the dock moves (the mount's settle tick included).
            const saves = adapter.saves
            const stored = JSON.stringify(adapter.load())
            const flags = JSON.stringify(storage.snapshot())
            const removed = storage.removed.length

            const offsetMs = offsetFor(action, hours)
            fireEvent.change(screen.getByRole("slider"), { target: { value: String(offsetMs) } })
            const app = container.querySelector<HTMLElement>(".gh-app")!
            expect(app.hasAttribute("data-previewing"), "the dock is previewing").toBe(true)

            const controls = await action.attempt(ctx)

            expect(adapter.saves, "no save reached the adapter").toBe(saves)
            expect(JSON.stringify(adapter.load()), "the stored snapshot is unchanged").toBe(stored)
            expect(JSON.stringify(storage.snapshot()), "the flags are unchanged").toBe(flags)
            expect(storage.removed.length, "no flag was removed").toBe(removed)
            expect(reload).not.toHaveBeenCalled()
            for (const control of controls) {
              expect(control.getAttribute("aria-disabled"), action.name).toBe("true")
              expect(control.getAttribute("title"), action.name).toBe(previewBlockedText)
            }
            if (action.opensNothing === true) expect(openDialog(), `${action.name} opened nothing`).toBeNull()
            if (action.refusal === "announced") expect(announcer()).toBe(previewBlockedText)
            if (action.refusal === "in-dialog") {
              expect(within(openDialog()!).getByRole("alert").textContent).toBe(previewBlockedText)
            }
            if (action.start === "first-run") expect(engine.view(T0)).toEqual([])
            cleanup()
          }
        ),
        { numRuns: 100 }
      )
    },
    120_000
  )
})
