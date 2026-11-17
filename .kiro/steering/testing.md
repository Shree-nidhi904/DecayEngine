# Testing

## Coverage

Every engine function has unit tests.

Engine rules are also covered by property-based tests with fast-check.

## Test types

### Outcome tests
Tests that prove specific behavior:
- "A fact with half-life 10 dies on day 94 if never reviewed"
- "Triage picks these 3 items for a 20-minute budget"
- "Health never increases with time between events"

### Property-based tests
Tests that check rules hold across many generated inputs:
- Health always stays 0-100
- Same input at the same moment gives the same output
- A dead item never appears in the due list
- `healthAt` is pure (same inputs → same output)

## Test isolation

Tests never depend on:
- The real clock
- The network

## Definition of done

A change is not done until tests pass **and prove the behavior**, not just execute without errors.

