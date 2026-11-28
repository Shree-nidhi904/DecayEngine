// "My street tonight": one picture of the street at the real time, made on
// the device as SVG text. A window per person (up to 18), lit, flickering or
// boarded up, and the counts in words. No names unless the user asks for
// first names. No url(), no link, no script: the colours are token values.

import { firstName, shownState, stateCounts } from "./lists"
import type { Person } from "./policy"
import { ghostedTheme } from "./theme"
import { hauntText, listNames, stateWords } from "./wording"

const c = ghostedTheme.colors
export const CARD_WIDTH = 640
export const CARD_HEIGHT = 360
const MAX_WINDOWS = 18

/** Text safe inside SVG. */
function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function shareCardSvg(people: readonly Person[], options: { names: boolean }): string {
  const counts = stateCounts(people)
  const shown = people.slice(0, MAX_WINDOWS)
  const perRow = Math.min(9, Math.max(1, shown.length))
  const w = 48
  const h = 56
  const gap = 14
  const rowWidth = perRow * w + (perRow - 1) * gap
  const left = (CARD_WIDTH - rowWidth) / 2
  // Under the three counters (feedback list, point 14).
  const top = 156

  const windows = shown
    .map((person, i) => {
      const x = left + (i % perRow) * (w + gap)
      const y = top + Math.floor(i / perRow) * (h + (options.names ? 34 : 18))
      const state = shownState(person)
      const lit = state === "dead" ? 0 : Math.max(0.15, Math.min(1, person.health / 100))
      const pane =
        state === "dead"
          ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${c["panel-hi"]}" stroke="${c.frame}" stroke-width="3"/>` +
            `<rect x="${x - 4}" y="${y + 14}" width="${w + 8}" height="9" fill="${c.board}" transform="rotate(-8 ${x + w / 2} ${y + 18})"/>` +
            `<rect x="${x - 4}" y="${y + 34}" width="${w + 8}" height="9" fill="${c["board-2"]}" transform="rotate(7 ${x + w / 2} ${y + 38})"/>`
          : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${state === "weak" ? c.flick : c.glow}" fill-opacity="${lit.toFixed(2)}" stroke="${c.frame}" stroke-width="3"/>` +
            `<line x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h}" stroke="${c.frame}" stroke-width="2"/>` +
            `<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="${c.frame}" stroke-width="2"/>`
      const label = options.names
        ? `<text x="${x + w / 2}" y="${y + h + 18}" text-anchor="middle" font-family="monospace" font-size="12" fill="${c.bone}">${esc(firstName(person.payload.name))}</text>`
        : ""
      return pane + label
    })
    .join("")

  const summary = `${counts.alive} ${stateWords.alive} · ${counts.weak} ${stateWords.weak} · ${counts.dead} ${stateWords.dead}`

  // The page's three tabs, in the page's order (Fading, Empty windows, Still lit), each with its shape,
  // its list name and its count, as one row (feedback list, point 14; Nov 28: same as the web app).
  const boxGap = 12
  const boxW = (CARD_WIDTH - 64 - 2 * boxGap) / 3
  const shape = (state: "alive" | "weak" | "dead", cx: number, cy: number, colour: string) =>
    state === "alive"
      ? `<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="${colour}" stroke-width="3"/>`
      : state === "weak"
        ? `<path d="M${cx} ${cy - 10}L${cx + 11} ${cy + 9}H${cx - 11}Z" fill="none" stroke="${colour}" stroke-width="3" stroke-linejoin="round"/>`
        : `<path d="M${cx - 9} ${cy - 9}L${cx + 9} ${cy + 9}M${cx + 9} ${cy - 9}L${cx - 9} ${cy + 9}" stroke="${colour}" stroke-width="3" stroke-linecap="round"/>`
  const counters = (
    [
      { state: "weak", name: listNames.weak, n: counts.weak, color: c.flick },
      { state: "dead", name: listNames.dead, n: counts.dead, color: c.dark },
      { state: "alive", name: listNames.alive, n: counts.alive, color: c.glow },
    ] as const
  )
    .map((box, i) => {
      const x = 32 + i * (boxW + boxGap)
      return (
        `<rect x="${x}" y="76" width="${boxW}" height="64" rx="10" fill="${c["panel-hi"]}" stroke="${c.border}" stroke-width="1"/>` +
        `<rect x="${x}" y="76" width="${boxW}" height="4" rx="2" fill="${box.color}"/>` +
        shape(box.state, x + 26, 110, box.color) +
        `<text x="${x + 46}" y="115" font-family="sans-serif" font-size="15" fill="${c.bone}">${esc(box.name)}</text>` +
        `<text x="${x + boxW - 16}" y="119" text-anchor="end" font-family="sans-serif" font-size="30" font-weight="700" fill="${box.color}">${box.n}</text>`
      )
    })
    .join("")

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">` +
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${c.bg}"/>` +
    `<rect y="${CARD_HEIGHT - 70}" width="${CARD_WIDTH}" height="70" fill="${c.wall}"/>` +
    `<circle cx="${CARD_WIDTH - 70}" cy="56" r="26" fill="${c.moon}"/>` +
    `<circle cx="${CARD_WIDTH - 58}" cy="50" r="24" fill="${c.bg}"/>` +
    `<desc>${esc(summary)}</desc>` +
    `<text x="32" y="52" font-family="sans-serif" font-size="30" font-weight="700" fill="${c.sign}">${esc(hauntText.share.title)}</text>` +
    counters +
    windows +
    `<text x="32" y="${CARD_HEIGHT - 26}" font-family="monospace" font-size="13" fill="${c.dim}">${esc(hauntText.share.footer)}</text>` +
    `</svg>`
  )
}
