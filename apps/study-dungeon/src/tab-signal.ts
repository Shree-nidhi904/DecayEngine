// The tab title and favicon while the tab is hidden (task L3, Requirement
// 23.6, 23.7, design "Live State Changes", Tab title and favicon). The same
// hook as Ghosted's tab-signal.ts, with Study Dungeon's icon (no import
// between apps).
//
// While the tab is hidden, each fact a minute tick moves adds one to a
// count. The title shows it, "(2) Study Dungeon" ("(9+) Study Dungeon"
// above 9), and the favicon gets a badge whose shape says what happened, as
// everywhere else in the app (design-tokens.md): a triangle when facts only
// weakened, a cross when any died. The title is the badge's text
// alternative (a favicon has none of its own), and the link's title
// attribute holds the same words. When the tab becomes visible
// (visibilitychange) the count goes back to 0 and the title is put back
// exactly. While the tab is visible nothing is counted: the toast says it.
//
// index.html has no favicon link, so the whole icon (a candle on a stone
// tile, plus the badge) is drawn here as an SVG data URL, added while the
// count is above 0 and removed again at 0. Nothing is fetched. Its colours
// are Study Dungeon tokens (--stone, --bone, --pumpkin, --blood, --bg).

import { useCallback, useEffect, useRef, useState } from "react"
import { liveText } from "./wording"

/** The base icon: a candle (--bone wax, --pumpkin flame) on a --stone tile. */
const BASE_SHAPES =
  "<rect width='32' height='32' rx='6' fill='#110d17'/>" +
  "<rect x='12' y='14' width='8' height='14' rx='1' fill='#f0e6cc'/>" +
  "<path d='M16 5 C19 9 19 12 16 13 C13 12 13 9 16 5 Z' fill='#ff8a2b'/>"

/** The badge in the top-right corner, on a --bg disc so its edge shows on any tab strip. */
const BADGES: Readonly<Record<"weak" | "dead", string>> = {
  // A triangle in --pumpkin: facts weakened.
  weak: "<circle cx='24' cy='8' r='8' fill='#060509'/><path d='M24 2 L30 13 L18 13 Z' fill='#ff8a2b'/>",
  // A cross in --blood: a fact died.
  dead: "<circle cx='24' cy='8' r='8' fill='#060509'/><path d='M19.5 3.5 L28.5 12.5 M28.5 3.5 L19.5 12.5' stroke='#ff5f77' stroke-width='3.5' stroke-linecap='round'/>",
}

/** The favicon with its badge, as a data URL (no network request). */
export function badgeIcon(worst: "weak" | "dead"): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>${BASE_SHAPES}${BADGES[worst]}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** The title with the count, or `base` itself at 0. */
export const titleWithCount = liveText.title

/** The part of `document` this file uses. */
type Doc = Pick<Document, "title" | "visibilityState" | "querySelector" | "createElement" | "head" | "addEventListener" | "removeEventListener">

export type TabSignal = {
  /** Called after a tick moved `changes` facts. Counted only while the tab is hidden. */
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

  // Puts the title and the icon back as they were, and removes the link this hook added.
  const restore = useCallback(() => {
    const before = original.current!
    doc.title = before.title
    if (before.link !== null) {
      if (before.href === null) before.link.removeAttribute("href")
      else before.link.setAttribute("href", before.href)
      before.link.removeAttribute("title")
    }
    created.current?.remove()
    created.current = null
  }, [doc])

  // One link is kept and updated in place while the count changes (removing and adding it on every
  // change made the favicon element churn); it is removed at 0.
  useEffect(() => {
    if (count.n <= 0) {
      restore()
      return
    }
    const before = original.current!
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
  }, [count, doc, restore])

  // On unmount, put everything back.
  useEffect(() => restore, [restore])

  return { record }
}
