// Public API of @decay-engine/insight: replay and what-if, built only on the
// engine's public API. Source of truth: .kiro/specs/insight/design.md (section 3).

export { replay } from "./replay"
export { whatIf } from "./what-if"
export { deathTime } from "./death-time"
export { DEATH_TIME_PRECISION_MS } from "./types"
export type {
  ReplayOptions,
  ReplayResult,
  ReplayReason,
  HistoryProblem,
  SkippedEntry,
  ExtraTend,
  WhatIfOptions,
  WhatIfResult,
  WhatIfReason,
  StopPoint,
  DeathTimeOptions,
} from "./types"
