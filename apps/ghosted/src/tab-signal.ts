// The tab title and favicon while the tab is hidden (task L3, Req 38.6,
// 38.7, design section 15.6).
//
// While the tab is hidden, each window a minute tick moves adds one to a
// count. The title shows it, "(2) Ghosted" ("(9+) Ghosted" above 9), and the
// favicon gets a badge whose shape says what happened, as everywhere else in
// the app (design-tokens.md): a triangle when windows only started to
// flicker, a cross when any went dark. The title is the badge's text
// alternative (a favicon has none of its own), and the link's title
// attribute holds the same words. When the tab becomes visible
// (visibilitychange) the count goes back to 0, and the title and the
// favicon are put back exactly as they were. While the tab is visible
// nothing is counted: the toast says it.
//
// The favicon is an SVG data URL, so nothing is fetched. Its colours are
// Ghosted tokens (--panel, --glow, --flick, --rust, --bg).

import { useCallback, useEffect, useRef, useState } from "react"
import { liveText } from "./wording"

/** The base icon, as in index.html: a lit window on a dark tile. */
const BASE_SHAPES =
  "<rect width='32' height='32' rx='6' fill='#100e1a'/><rect x='11' y='8' width='10' height='16' rx='1' fill='#ffd479'/>"

/** The badge in the top-right corner, on a --bg disc so its edge shows on any tab strip. */
const BADGES: Readonly<Record<"weak" | "dead", string>> = {
  // A triangle in --flick: windows started to flicker.
  weak: "<circle cx='24' cy='8' r='8' fill='#07060d'/><path d='M24 2 L30 13 L18 13 Z' fill='#ff9a4a'/>",
  // A cross in --rust: a window went dark.
  dead: "<circle cx='24' cy='8' r='8' fill='#07060d'/><path d='M19.5 3.5 L28.5 12.5 M28.5 3.5 L19.5 12.5' stroke='#ff7a7a' stroke-width='3.5' stroke-linecap='round'/>",
}

/** The favicon with its badge, as a data URL (no network request). */
export function badgeIcon(worst: "weak" | "dead"): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>${BASE_SHAPES}${BADGES[worst]}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** The title with the count, or `base` itself at 0. */
export const titleWithCount = liveText.title

/** The part of `document` this file uses. Tests pass jsdom's own document. */
type Doc = Pick<Document, "title" | "visibilityState" | "querySelector" | "createElement" | "head" | "addEventListener" | "removeEventListener">

export type TabSignal = {
  /** Called after a tick moved `changes` windows. Counted only while the tab is hidden. */
  record: (changes: number, worst: "weak" | "dead") => void
}

type Count = { n: number; worst: "weak" | "dead" }

/**
 * Keeps the tab title and the favicon in step with the count, and puts both
 * back on visibilitychange to visible and on unmount.
 */
export function useTabSignal(doc: Doc = document): TabSignal {
  const [count, setCount] = useState<Count>({ n: 0, worst: "weak" })
  // What the page had before any change, read once.
  const original = useRef<{ title: string; link: HTMLLinkElement | null; href: string | null } | null>(null)
  const created = useRef<HTMLLinkElement | null>(null)
  if (original.current === null) {
    const link = doc.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    original.current = { title: doc.title, link, href: link?.getAttribute("href") ?? null }
  }

  const record = useCallback(
    (changes: number, worst: "weak" | "dead") => {
      if (changes <= 0 || doc.visibilityState !== "hidden") return
      setCount((c) => ({ n: c.n + changes, worst: c.worst === "dead" || worst === "dead" ? "dead" : "weak" }))
    },
    [doc]
  )

  useEffect(() => {
    const onVisibility = () => {
      if (doc.visibilityState === "visible") setCount({ n: 0, worst: "weak" })
    }
    doc.addEventListener("visibilitychange", onVisibility)
    return () => doc.removeEventListener("visibilitychange", onVisibility)
  }, [doc])

  useEffect(() => {
    const before = original.current!
    const restore = () => {
      doc.title = before.title
      if (before.link !== null) {
        if (before.href === null) before.link.removeAttribute("href")
        else before.link.setAttribute("href", before.href)
        before.link.removeAttribute("title")
      }
      created.current?.remove()
      created.current = null
    }
    if (count.n <= 0) {
      restore()
      return
    }
    const title = titleWithCount(count.n, before.title)
    doc.title = title
    let link = before.link ?? created.current
    if (link === null) {
      link = doc.createElement("link")
      link.rel = "icon"
      link.type = "image/svg+xml"
      doc.head.appendChild(link)
      created.current = link
    }
    link.setAttribute("href", badgeIcon(count.worst))
    link.setAttribute("title", title)
    return restore
  }, [count, doc])

  return { record }
}
