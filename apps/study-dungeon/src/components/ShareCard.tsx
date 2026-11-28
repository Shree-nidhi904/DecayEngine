// Draws shareCardSvg onto a canvas and downloads a PNG; if the browser
// cannot draw it, the SVG itself is downloaded. A data: URL is used, so no
// Blob URL needs cleaning up and no timer is needed. Nothing leaves the device.

import { useId } from "react"
import { CARD_HEIGHT, CARD_WIDTH, shareCardSvg, type CardCounts } from "../share-card"
import { hauntText } from "../wording"

export interface ShareCardProps {
  counts: () => CardCounts
  announce: (text: string) => void
  download?: (fileName: string, href: string) => void
}

function clickDownload(fileName: string, href: string) {
  const link = document.createElement("a")
  link.href = href
  link.download = fileName
  link.click()
}

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

export function ShareCard({ counts, announce, download = clickDownload }: ShareCardProps) {
  const privacyId = useId()
  const make = () => {
    const svg = shareCardSvg(counts())
    const fallback = () => download("study-dungeon.svg", svgDataUrl(svg))
    try {
      const canvas = document.createElement("canvas")
      canvas.width = CARD_WIDTH * 2
      canvas.height = CARD_HEIGHT * 2
      const ctx = canvas.getContext("2d")
      const picture = typeof Image === "function" ? new Image() : null
      if (ctx === null || picture === null) {
        fallback()
      } else {
        picture.onload = () => {
          try {
            ctx.drawImage(picture, 0, 0, canvas.width, canvas.height)
            download("study-dungeon.png", canvas.toDataURL("image/png"))
          } catch {
            fallback()
          }
        }
        picture.onerror = () => fallback()
        picture.src = svgDataUrl(svg)
      }
      announce(hauntText.share.made)
    } catch {
      announce(hauntText.share.failed)
    }
  }
  return (
    <div className="sd-haunt-setting">
      <button type="button" className="sd-button sd-button-quiet" data-action="share" aria-describedby={privacyId} onClick={make}>
        {hauntText.share.button}
      </button>
      <p id={privacyId} className="sd-haunt-note">
        {hauntText.share.privacy}
      </p>
    </div>
  )
}
