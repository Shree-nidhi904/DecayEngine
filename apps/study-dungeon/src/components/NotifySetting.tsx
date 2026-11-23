// The notification setting (task L5, Requirement 24.1-24.4, design
// "Notifications While the Tab Is Open"). A switch in the settings row,
// after the sound switch, built as SoundToggle is (a checkbox with the
// switch role and a label). Off by default.
//
// The browser's permission is asked only inside the change that turns it
// on, and only while the permission is "default"; never at load and never on
// a tick. A pending request ignores further changes. Denied never asks
// again: the change only repeats how to allow it, through the App's one
// live region. The App owns the setting (handleTick reads it too); this
// component reads api.permission on every render, so a choice changed in the
// browser shows at the next tick. A preference, so it works while previewing.

import { useEffect, useId, useRef } from "react"
import { notifySettingState, type NotificationApi, type NotifyPermission } from "../notify"
import { notifyText } from "../wording"
import "../styles/notify.css"

export interface NotifySettingProps {
  /** The browser's Notification class, or null when there is none. */
  api: NotificationApi | null
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
  const id = useId()
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  if (api === null) {
    return (
      <div className="sd-notify">
        <p className="sd-notify-note">{notifyText.unsupported}</p>
      </div>
    )
  }

  const state = notifySettingState(api, enabled)
  const change = () => {
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
  const described = [
    status === null ? null : `${id}-status`,
    saved ? null : `${id}-saved`,
    `${id}-limit`,
    `${id}-privacy`,
  ].filter((x) => x !== null)

  return (
    <div className="sd-notify" data-state={state}>
      <div className="sd-notify-toggle">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={enabled}
          aria-describedby={described.join(" ")}
          onChange={change}
        />
        <label htmlFor={id}>{notifyText.label}</label>
      </div>
      {status !== null && (
        <p id={`${id}-status`} className="sd-notify-note" data-note={state}>
          {status}
        </p>
      )}
      {!saved && (
        <p id={`${id}-saved`} className="sd-notify-note" data-note="not-saved">
          {notifyText.notSaved}
        </p>
      )}
      <p id={`${id}-limit`} className="sd-notify-note" data-note="limit">
        {notifyText.limit}
      </p>
      <p id={`${id}-privacy`} className="sd-notify-note" data-note="privacy">
        {notifyText.privacy}
      </p>
    </div>
  )
}
