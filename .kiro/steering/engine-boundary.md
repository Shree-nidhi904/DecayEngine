# Engine Boundary

These are hard rules. Do not break them.

## Import restrictions

`packages/engine` must never import from:
- `apps/`
- `packages/shell/`
- React
- Any UI library

**Lint rule:** Add an ESLint rule that fails the build if the engine imports an app.

## Time handling

The engine must never read the clock. No `Date.now()` and no `new Date()` inside `packages/engine`.

The current time is always passed in as a number argument called `now`.

## Item abstraction

The engine knows nothing about what an item is. All app-specific knowledge lives in a policy.

## When an app seems to need an engine change

**Stop and report it. Do not change the engine.**

The policy contract is what gets reviewed instead.

## Policy purity

All policy functions are pure and synchronous except `resurrect`, which is asynchronous:

```typescript
interface DecayPolicy<Payload, PolicyData, Event> {
  thresholds: { weak: number; dead: number }
  init(payload: Payload, now: number): PolicyData
  healthAt(item: Item<Payload, PolicyData>, now: number): number
  applyEvent(item: Item<Payload, PolicyData>, event: Event, now: number): { health: number; policyData: PolicyData }
  nextDueAt(item: Item<Payload, PolicyData>, now: number): number | null
  resurrect(item: Item<Payload, PolicyData>, now: number): Promise<
    | { ok: true; payload?: Payload; policyData?: PolicyData }
    | { ok: false; reason: string }
  >
}
```

Rules:
- Same inputs → same output (all functions are pure)
- No side effects
- `resurrect` is the only async function; `init`, `healthAt`, `applyEvent`, and `nextDueAt` are synchronous
- `healthAt` must never increase with time between events

**Source of truth:** `.kiro/specs/engine/requirements.md` (Type Contract section)

