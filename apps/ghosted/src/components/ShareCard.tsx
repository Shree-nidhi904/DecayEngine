
//
// Draws shareCardSvg onto a canvas and downloads a PNG. If the browser
// cannot draw it, the SVG itself is downloaded. A data: URL is used, so no
// Blob URL needs cleaning up later and no timer is needed. Nothing leaves the
// device.

import { useId, useState } from "react"
import { snapshotElements } from "@decay-engine/shell"
import { ghostedTheme } from "../theme"
import type { Person } from "../policy"
import { CARD_HEIGHT, CARD_WIDTH, shareCardSvg } from "../share-card"
import { hauntText } from "../wording"

export interface ShareCardProps {
  /** engine.view(realNow). */
  people: readonly Person[]
  announce: (text: string) => void
  /** Saves the file. Tests pass a fake; the default clicks a download link. */
  download?: (fileName: string, href: string) => void
}

function clickDownload(fileName: string, href: string) {
  const link = document.createElement("a")
  link.href = href
  link.download = fileName
  link.click()
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function ShareCard({ people, announce, download = clickDownload }: ShareCardProps) {
  const [names, setNames] = useState(false)
  const privacyId = useId()

  const make = () => {
    // A picture of the page's own counters, as they look now.
    // If the browser cannot draw it, the drawn card below is used.
    // With names on, the drawn card is used: it lists first names cleanly. Without, only the counters are pictured.
    const parts = (names ? [] : [".gh-hero-stats"])
      .map((selector) => document.querySelector<HTMLElement>(selector))
      .filter((el): el is HTMLElement => el !== null)
    if (parts.length > 0 && !navigator.userAgent.includes("jsdom")) {
      snapshotElements(parts, {
        background: ghostedTheme.colors.bg,
        title: hauntText.share.title,
        titleColor: ghostedTheme.colors.sign,
        titleFont: "700 34px sans-serif",
        accent: ghostedTheme.colors.sign,
        padding: 32,
        gap: 20,
        footer: hauntText.share.footer,
        footerColor: ghostedTheme.colors.dim,
      })
        .then((href) => download("ghosted-street.png", href))
        .catch(() => drawn())
      announce(hauntText.share.made)
      return
    }
    drawn()
  }
  const drawn = () => {
    const svg = shareCardSvg(people, { names })
    const fallback = () => download("ghosted-street.svg", svgDataUrl(svg))
    try {
      const canvas = document.createElement("canvas")
      canvas.width = CARD_WIDTH * 2
      canvas.height = CARD_HEIGHT * 2
      const ctx = canvas.getContext("2d")
      const picture = typeof Image === "function" ? new Image() : null
      if (ctx === null || picture === null) {
        fallback()
        announce(hauntText.share.made)
        return
      }
      picture.onload = () => {
        try {
          ctx.drawImage(picture, 0, 0, canvas.width, canvas.height)
          download("ghosted-street.png", canvas.toDataURL("image/png"))
        } catch {
          fallback()
        }
      }
      picture.onerror = () => fallback()
      picture.src = svgDataUrl(svg)
      announce(hauntText.share.made)
    } catch {
      announce(hauntText.share.failed)
    }
  }

  return (
    <div className="gh-share">
      <div className="gh-share-row">
        <button type="button" className="gh-button" data-action="share" aria-describedby={privacyId} onClick={make}>
          {hauntText.share.button}
        </button>
        <label className="gh-share-names">
          <input type="checkbox" checked={names} onChange={(e) => setNames(e.currentTarget.checked)} />
          {hauntText.share.names}
        </label>
      </div>
      <p id={privacyId} className="gh-haunt-note">
        {hauntText.share.privacy}
      </p>
    </div>
  )
}
