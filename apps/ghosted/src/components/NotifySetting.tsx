// The notification setting (task L5, Req 39.1-39.4, design section 16.3).
//
// One switch, under the toolbar: "Notify me about changes while this tab is
// open". Off by default. The browser's permission is asked only inside the
// click that turns it on, and only while the permission is "default"; never
// at load and never on a tick. A pending request ignores further clicks.
// Denied never asks again: a click only repeats how to allow it, through the
// App's one live region. The App owns the setting (it also reads it on each
// tick); this component reads api.permission on every render, so a choice
// changed in the browser shows at the next tick.
//
// Under the switch: the state's sentence (on, denied, blocked, not saved),
// then the honest limit and the privacy note. With no Notification API there
// is no switch, only one sentence. A preference, not data: it works while
// previewing, as Study Dungeon's sound switch does.

import { useEffect, useId, useRef, useState } from "react"
import { notifySettingState, type NotificationApi, type NotifyPermission } from "../notify"
import { notifyText } from "../wording"
import "../styles/notify.css"

export interface NotifySettingProps {
  /** The browser's Notification class, or null when there is none. */
  api: NotificationApi | null
  /** The user's setting. */
  enabled: boolean
  /** False when the last save threw: the choice lasts until the page is closed. */
  saved: boolean
  onChange: (enabled: boolean) => void
  /** Says a sentence through the App's live region. */
  announce: (text: string) => void
}

/** The answer of requestPermission, in either the promise or the old callback-less form. */
async function askPermission(api: NotificationApi): Promise<NotifyPermission> {
  const answer: unknown = await Promise.resolve(api.requestPermission())
  return answer === "granted" || answer === "denied" || answer === "default" ? answer : api.permission
}

export function NotifySetting({ api, enabled, saved, onChange, announce }: NotifySettingProps) {
  const statusId = useId()
  const limitId = useId()
  const privacyId = useId()
  const pending = useRef(false)
  const mounted = useRef(true)
  // After the browser's answer the permission has changed but nothing else has, so draw again: the
  // denied sentence then shows under the switch at once, not at the next tick.
  const [, redraw] = useState(0)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const state = notifySettingState(api, enabled)

  if (api === null) {
    return (
      <section className="gh-notify" aria-label={notifyText.region}>
        <p className="gh-notify-note">{notifyText.unsupported}</p>
      </section>
    )
  }

  const toggle = () => {
    if (enabled) {
      onChange(false)
      return
    }
    if (pending.current) return
    const permission = api.permission
    if (permission === "granted") {
      onChange(true)
      return
    }
    if (permission === "denied") {
      announce(notifyText.denied)
      return
    }
    pending.current = true
    void askPermission(api).then(
      (answer) => {
        pending.current = false
        if (!mounted.current) return
        redraw((n) => n + 1)
        if (answer === "granted") onChange(true)
        else if (answer === "denied") announce(notifyText.denied)
      },
      () => {
        pending.current = false
      }
    )
  }

  const status =
    state === "on" ? notifyText.on : state === "denied" ? notifyText.denied : state === "blocked" ? notifyText.blocked : null

  return (
    <section className="gh-notify" aria-label={notifyText.region}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-describedby={[status === null ? null : statusId, saved ? null : `${statusId}-saved`, limitId, privacyId]
          .filter((id) => id !== null)
          .join(" ")}
        className="gh-button gh-notify-switch"
        data-state={state}
        onClick={toggle}
      >
        <span className="gh-notify-label">{notifyText.label}</span>
        <span className="gh-notify-state" aria-hidden="true">
          {enabled ? notifyText.stateOn : notifyText.stateOff}
        </span>
      </button>
      {status !== null && (
        <p id={statusId} className="gh-notify-note" data-note={state}>
          {status}
        </p>
      )}
      {!saved && (
        <p id={`${statusId}-saved`} className="gh-notify-note" data-note="not-saved">
          {notifyText.notSaved}
        </p>
      )}
      <p id={limitId} className="gh-notify-note" data-note="limit">
        {notifyText.limit}
      </p>
      <p id={privacyId} className="gh-notify-note" data-note="privacy">
        {notifyText.privacy}
      </p>
    </section>
  )
}
