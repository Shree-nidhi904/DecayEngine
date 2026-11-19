// How a fight checks the answer, so "I knew it" cannot be clicked for free.
// - choices: pick the answer from up to four, the others taken from your
//   other facts' answers (the default).
// - typed:   type the answer; it is checked with some slack for case,
//   punctuation, articles, small typos and a trailing explanation.
// - self:    the old honour system: show the answer, then say if you knew it.
// The setting is a preference for this browser, kept in localStorage like
// the sound setting (not cleared by Reset).
//
// Pure apart from the storage helpers. No clock reads.
// Written by Claude Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

export type AnswerCheck = "choices" | "typed" | "self"

export const ANSWER_CHECKS: readonly AnswerCheck[] = ["choices", "typed", "self"]

export const ANSWER_CHECK_KEY = "study-dungeon:answer-check"

export const DEFAULT_ANSWER_CHECK: AnswerCheck = "choices"

type SettingStorage = Pick<Storage, "getItem" | "setItem">

export function loadAnswerCheck(
  storage: SettingStorage | undefined,
  fallback: AnswerCheck = DEFAULT_ANSWER_CHECK
): AnswerCheck {
  try {
    const saved = storage?.getItem(ANSWER_CHECK_KEY)
    return ANSWER_CHECKS.includes(saved as AnswerCheck) ? (saved as AnswerCheck) : fallback
  } catch {
    return fallback
  }
}

export function saveAnswerCheck(storage: SettingStorage | undefined, check: AnswerCheck): void {
  try {
    storage?.setItem(ANSWER_CHECK_KEY, check)
  } catch {
    // A preference: if it cannot be saved, it simply resets next time.
  }
}

const ARTICLES = new Set(["a", "an", "the"])

/** Lower case, accents and punctuation removed, articles dropped, spaces collapsed. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter((w) => w !== "" && !ARTICLES.has(w))
    .join(" ")
}

/** Edit distance (insert, delete, replace). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]!
}

/** Typos allowed for an answer this long: none up to 3 letters, then one per five. */
const slack = (text: string) => (text.length <= 3 ? 0 : Math.max(1, Math.floor(text.length / 5)))

const close = (typed: string, target: string) => target !== "" && editDistance(typed, target) <= slack(target)

/**
 * Whether a typed answer counts as right. Matches the whole answer, or its
 * main part when the rest is an explanation: before a parenthesis
 * ("The ohm (Ω)" → "ohm"), or before a comma when that part is at least two
 * words or five letters ("Peace of Westphalia, 1648", but not "SYN" in
 * "SYN, SYN-ACK, ACK").
 */
export function checkTyped(typed: string, answer: string): boolean {
  const t = normalizeAnswer(typed)
  if (t === "") return false
  const whole = normalizeAnswer(answer)
  if (close(t, whole)) return true
  const beforeParen = normalizeAnswer(answer.split("(")[0] ?? "")
  if (answer.includes("(") && close(t, beforeParen)) return true
  const beforeComma = normalizeAnswer(answer.split(",")[0] ?? "")
  if (answer.includes(",") && (beforeComma.includes(" ") || beforeComma.length >= 5) && close(t, beforeComma)) return true
  return false
}

/** FNV-1a: a stable order for the options, so they do not jump between renders. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** How alike two answers look: similar length, words, digits and commas. Higher is more alike. */
export function likeness(a: string, b: string): number {
  const words = (t: string) => t.trim().split(/\s+/).length
  const has = (t: string, re: RegExp) => re.test(t)
  let score = 0
  score -= Math.abs(Math.log((a.length + 1) / (b.length + 1)))
  score -= Math.abs(words(a) - words(b)) * 0.15
  if (has(a, /\d/) === has(b, /\d/)) score += 0.5
  if (has(a, /,/) === has(b, /,/)) score += 0.3
  if (has(a, /[()]/) === has(b, /[()]/)) score += 0.2
  return score
}

/**
 * Up to `count` options: the fact's answer and wrong ones from the other
 * facts' answers (never one that reads the same as the right answer). Null
 * when there are fewer than two wrong options to pick from; the fight then
 * asks for a typed answer instead.
 */
export function buildChoices(
  fact: { id: string; payload: { answer: string } },
  pool: readonly { id: string; payload: { answer: string } }[],
  count = 4
): string[] | null {
  const right = fact.payload.answer
  const seen = new Set([normalizeAnswer(right)])
  const wrong: { text: string; score: number; order: number }[] = []
  for (const other of pool) {
    if (other.id === fact.id) continue
    const key = normalizeAnswer(other.payload.answer)
    if (key === "" || seen.has(key)) continue
    seen.add(key)
    wrong.push({ text: other.payload.answer, score: likeness(right, other.payload.answer), order: hash(`${fact.id}|${other.id}`) })
  }
  if (wrong.length < 2) return null
  // The most alike answers first, so the wrong options are not giveaways;
  // among equally alike ones, a stable shuffle.
  const picked = wrong.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, count - 1)
  const options = [{ text: right, order: hash(`${fact.id}|right`) }, ...picked.map((w) => ({ text: w.text, order: hash(`${w.text}|${fact.id}`) }))]
  return options.sort((a, b) => a.order - b.order).map((o) => o.text)
}
