// Live state changes (task L3, Req 38, design section 15.2): which items
// changed state between two engine views.
//
// Pure: no clock, no engine call, no policy formula. The App passes a copy of
// engine.view(before) and engine.view(after) around a minute tick; L5
// (browser notifications) is meant to reuse this file as it is. Study
// Dungeon has the same file with the same logic (no import between apps,
// Req 21.1).

/** The three states the engine derives (engine Item.state). */
export type LifeState = "alive" | "weak" | "dead"

/** The part of an engine item this file reads. */
export type StateOf = { readonly id: string; readonly state: LifeState }

/** One item that changed state. */
export type StateChange = { readonly id: string; readonly from: LifeState; readonly to: LifeState }

/**
 * A copy of the id and state of each item, so a later engine call cannot
 * change what was recorded.
 */
export function snapshotStates(items: Iterable<StateOf>): StateOf[] {
  return Array.from(items, (item) => ({ id: item.id, state: item.state }))
}

/**
 * The items whose state differs between `before` and `after`, in the order
 * of `after`. An item in only one of the two (added or removed in between)
 * is not a change. Neither input is changed.
 */
export function diffStates(before: Iterable<StateOf>, after: Iterable<StateOf>): StateChange[] {
  const was = new Map<string, LifeState>()
  for (const item of before) was.set(item.id, item.state)
  const changes: StateChange[] = []
  for (const item of after) {
    const from = was.get(item.id)
    if (from !== undefined && from !== item.state) changes.push({ id: item.id, from, to: item.state })
  }
  return changes
}
