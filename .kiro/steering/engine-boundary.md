# Engine Boundary

These are hard rules. Do not break them.

## Import restrictions

`packages/engine` must never import from:
- `apps/`
- `packages/shell/`
- React
- Any UI library

## Time handling

The engine must never read the clock. No `Date.now()` and no `new Date()` inside `packages/engine`.

The current time is always passed in as a number argument called `now`.

## Item abstraction

The engine knows nothing about what an item is. All app-specific knowledge lives in a policy.

## When an app seems to need an engine change

**Stop and report it. Do not change the engine.**

The policy contract is what gets reviewed instead.

## Policy purity

Policy functions `healthAt`, `applyEvent`, and `nextDueAt` must be pure:
- Same inputs → same output
- No side effects
