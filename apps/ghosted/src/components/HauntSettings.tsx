//
// Two toggle buttons (aria-pressed) styled like the notification switch
// (notify.css): Spooky level (Haunted / Calm) and Sound (Off / On), then
// "Share a card". The notification setting stays the page's only switch.
// Preferences, not data, so they work while previewing too.

import { useId, type ReactNode } from "react"
import type { SpookyLevel } from "../spooky-level"
import { hauntText, notifyText } from "../wording"
import "../styles/haunt.css"

export interface HauntSettingsProps {
  spooky: SpookyLevel
  spookySaved: boolean
  onSpooky: (level: SpookyLevel) => void
  sound: boolean
  onSound: (on: boolean) => void
  /** The share card controls (ShareCard), placed last. */
  share?: ReactNode
}

export function HauntSettings({ spooky, spookySaved, onSpooky, sound, onSound, share }: HauntSettingsProps) {
  const spookyHelp = useId()
  const soundHelp = useId()
  const haunted = spooky === "haunted"
  return (
    <section className="gh-haunt-settings" aria-label={hauntText.spooky.label}>
      <button
        type="button"
        aria-pressed={haunted}
        aria-describedby={spookyHelp}
        className="gh-button gh-haunt-toggle"
        data-setting="spooky"
        onClick={() => onSpooky(haunted ? "calm" : "haunted")}
      >
        <span className="gh-haunt-label">{hauntText.spooky.label}</span>
        <span className="gh-haunt-state" aria-hidden="true">
          {haunted ? hauntText.spooky.haunted : hauntText.spooky.calm}
        </span>
      </button>
      <p id={spookyHelp} className="gh-haunt-note">
        {hauntText.spooky.help}
        {!spookySaved && ` ${hauntText.spooky.notSaved}`}
      </p>
      <button
        type="button"
        aria-pressed={sound}
        aria-describedby={soundHelp}
        className="gh-button gh-haunt-toggle"
        data-setting="sound"
        onClick={() => onSound(!sound)}
      >
        <span className="gh-haunt-label">{hauntText.sound.label}</span>
        <span className="gh-haunt-state" aria-hidden="true">
          {sound ? notifyText.stateOn : notifyText.stateOff}
        </span>
      </button>
      <p id={soundHelp} className="gh-haunt-note">
        {hauntText.sound.help}
      </p>
      {share}
    </section>
  )
}
