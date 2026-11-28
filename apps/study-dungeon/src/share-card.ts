// "My Dungeon tonight": an image of the three counters (Crypt, Dungeon,
// Graveyard) at the real time, as SVG text: one panel each, with its state's
// shape (circle, triangle, cross), its name and its count, and the souls
// banished under them (feedback list, point 14). Counts only: no question or
// answer ever goes on the card (Req 9.3). No url(), no link, no script.

import { studyDungeonTheme } from "./theme"
import { hauntText, studyDungeonWording } from "./wording"

const c = studyDungeonTheme.colors
export const CARD_WIDTH = 640
export const CARD_HEIGHT = 360

export type CardCounts = { alive: number; weak: number; dead: number; souls: number }

const PANEL_WIDTH = 176
const PANEL_GAP = 16
const PANEL_TOP = 112
const PANEL_HEIGHT = 168

/** The state's shape, centred on (cx, cy): alive a circle, weak a triangle, dead a cross. */
function glyph(state: "alive" | "weak" | "dead", cx: number, cy: number, colour: string): string {
  if (state === "alive") return `<circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="${colour}" stroke-width="4"/>`
  if (state === "weak") {
    return `<path d="M${cx} ${cy - 15}L${cx + 16} ${cy + 13}H${cx - 16}Z" fill="none" stroke="${colour}" stroke-width="4" stroke-linejoin="round"/>`
  }
  return `<path d="M${cx - 13} ${cy - 13}L${cx + 13} ${cy + 13}M${cx + 13} ${cy - 13}L${cx - 13} ${cy + 13}" stroke="${colour}" stroke-width="4" stroke-linecap="round"/>`
}

export function shareCardSvg(counts: CardCounts): string {
  const t = hauntText.share
  const panels: { state: "alive" | "weak" | "dead"; label: string; value: number; colour: string }[] = [
    { state: "alive", label: studyDungeonWording.lists.alive, value: counts.alive, colour: c.ecto },
    { state: "weak", label: studyDungeonWording.lists.weak, value: counts.weak, colour: c.pumpkin },
    { state: "dead", label: studyDungeonWording.lists.dead, value: counts.dead, colour: c.blood },
  ]
  const left = (CARD_WIDTH - (3 * PANEL_WIDTH + 2 * PANEL_GAP)) / 2
  const drawn = panels
    .map((p, i) => {
      const x = left + i * (PANEL_WIDTH + PANEL_GAP)
      const cx = x + PANEL_WIDTH / 2
      // As the page's counters: the number on top, then the shape and the name side by side.
      const nameWidth = p.label.length * 11
      const startX = cx - (30 + nameWidth) / 2
      return (
        `<rect x="${x}" y="${PANEL_TOP}" width="${PANEL_WIDTH}" height="${PANEL_HEIGHT}" rx="10" fill="${c.stone}" stroke="${p.colour}" stroke-width="2"/>` +
        `<text x="${cx}" y="${PANEL_TOP + 82}" text-anchor="middle" font-family="serif" font-size="68" font-weight="bold" fill="${c.bone}">${p.value}</text>` +
        glyph(p.state, startX + 10, PANEL_TOP + 128, p.colour).replace(/stroke-width="4"/g, 'stroke-width="3"').replace(/r="14"/, 'r="9"') +
        `<text x="${startX + 30}" y="${PANEL_TOP + 134}" font-family="monospace" font-size="16" letter-spacing="2" fill="${p.colour}">${p.label.toUpperCase()}</text>`
      )
    })
    .join("")
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">` +
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${c.bg}"/>` +
    `<rect y="${CARD_HEIGHT - 64}" width="${CARD_WIDTH}" height="64" fill="${c.stone}"/>` +
    `<text x="32" y="64" font-family="serif" font-size="38" fill="${c.pumpkin}">${t.title}</text>` +
    drawn +
    `<text x="32" y="${CARD_HEIGHT - 24}" font-family="monospace" font-size="14" fill="${c.moon}">${counts.souls} ${t.souls}</text>` +
    `<text x="${CARD_WIDTH - 32}" y="${CARD_HEIGHT - 24}" text-anchor="end" font-family="monospace" font-size="13" fill="${c.boneDim}">${t.footer}</text>` +
    `</svg>`
  )
}
