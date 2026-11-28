// "My Dungeon tonight": the counts at the real time as SVG text, one small
// creature or stone per fact (up to 24). Counts only: no question or answer
// ever goes on the card (Req 9.3). No url(), no link, no script.

import { studyDungeonTheme } from "./theme"
import { hauntText } from "./wording"

const c = studyDungeonTheme.colors
export const CARD_WIDTH = 640
export const CARD_HEIGHT = 360
const MAX_MARKS = 24

export type CardCounts = { alive: number; weak: number; dead: number; souls: number }

export function shareCardSvg(counts: CardCounts): string {
  const t = hauntText.share
  const states: ("alive" | "weak" | "dead")[] = [
    ...Array<"alive">(counts.alive).fill("alive"),
    ...Array<"weak">(counts.weak).fill("weak"),
    ...Array<"dead">(counts.dead).fill("dead"),
  ].slice(0, MAX_MARKS)
  const perRow = 12
  const size = 34
  const gap = 12
  const rowWidth = Math.min(perRow, Math.max(1, states.length)) * (size + gap) - gap
  const left = (CARD_WIDTH - rowWidth) / 2
  const marks = states
    .map((state, i) => {
      const x = left + (i % perRow) * (size + gap)
      const y = 130 + Math.floor(i / perRow) * (size + 22)
      const cx = x + size / 2
      if (state === "dead") {
        return (
          `<path d="M${x + 4} ${y + size}V${y + 12}a${size / 2 - 4} ${size / 2 - 4} 0 0 1 ${size - 8} 0V${y + size}z" fill="${c.stoneHi}" stroke="${c.boneDim}" stroke-width="2"/>` +
          `<path d="M${cx} ${y + 10}v14M${cx - 5} ${y + 15}h10" stroke="${c.boneDim}" stroke-width="2"/>`
        )
      }
      const fill = state === "weak" ? c.pumpkin : c.ecto
      return (
        `<ellipse cx="${cx}" cy="${y + size / 2 + 4}" rx="${size / 2}" ry="${size / 2 - 4}" fill="${fill}" fill-opacity="${state === "weak" ? 1 : 0.55}"/>` +
        `<circle cx="${cx - 6}" cy="${y + size / 2}" r="3" fill="${c.bg}"/><circle cx="${cx + 6}" cy="${y + size / 2}" r="3" fill="${c.bg}"/>`
      )
    })
    .join("")
  const summary = `${counts.alive} ${t.alive} · ${counts.weak} ${t.weak} · ${counts.dead} ${t.dead}`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">` +
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${c.bg}"/>` +
    `<rect y="${CARD_HEIGHT - 64}" width="${CARD_WIDTH}" height="64" fill="${c.stone}"/>` +
    `<text x="32" y="60" font-family="serif" font-size="34" fill="${c.pumpkin}">${t.title}</text>` +
    `<text x="32" y="90" font-family="monospace" font-size="14" fill="${c.boneDim}">${summary}</text>` +
    marks +
    `<text x="32" y="${CARD_HEIGHT - 24}" font-family="monospace" font-size="14" fill="${c.moon}">${counts.souls} ${t.souls}</text>` +
    `<text x="${CARD_WIDTH - 32}" y="${CARD_HEIGHT - 24}" text-anchor="end" font-family="monospace" font-size="13" fill="${c.boneDim}">${t.footer}</text>` +
    `</svg>`
  )
}
