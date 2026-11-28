// "My street tonight": one picture of the street at the real time, made on
// the device as SVG text. A window per person (up to 18), lit, flickering or
// boarded up, and the counts in words. No names unless the user asks for
// first names. No url(), no link, no script: the colours are token values.

import { firstName, shownState, stateCounts } from "./lists"
import type { Person } from "./policy"
import { ghostedTheme } from "./theme"
import { hauntText, stateWords } from "./wording"

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
  const top = 112

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

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">` +
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${c.bg}"/>` +
    `<rect y="${CARD_HEIGHT - 70}" width="${CARD_WIDTH}" height="70" fill="${c.wall}"/>` +
    `<circle cx="${CARD_WIDTH - 70}" cy="56" r="26" fill="${c.moon}"/>` +
    `<circle cx="${CARD_WIDTH - 58}" cy="50" r="24" fill="${c.bg}"/>` +
    `<text x="32" y="58" font-family="sans-serif" font-size="30" font-weight="700" fill="${c.sign}">${esc(hauntText.share.title)}</text>` +
    `<text x="32" y="86" font-family="monospace" font-size="14" fill="${c.dim}">${esc(summary)}</text>` +
    windows +
    `<text x="32" y="${CARD_HEIGHT - 26}" font-family="monospace" font-size="13" fill="${c.dim}">${esc(hauntText.share.footer)}</text>` +
    `</svg>`
  )
}
