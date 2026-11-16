# Testing

## Coverage

Every engine function has unit tests.

Engine rules are also covered by property-based tests with fast-check.

## Test isolation

Tests never depend on:
- The real clock
- The network

## Definition of done

A change is not done until tests pass.
