# No Fake Tests

## What a test must do

A test must check **behavior**, not just that something exists or runs without error.

If a test passes but the code is broken, the test is worthless.

## Rules

### Never hide failures

- Never catch an error inside a test so that the test passes
- Never weaken, skip, delete or mark a test optional to make it pass
- If a test fails, fix the code, or stop and report if the test itself looks wrong

### Never fake passing

- Never change expected values to match wrong output
- Never hard-code a function's return value just to satisfy a test
- If a requirement cannot be met as written, stop and say so. Do not satisfy its wording while breaking its intent.

### Property tests

- Keep `{ numRuns: 100 }` or more
- Generators must actually reach alive, weak and dead items (the generator coverage check)
- Never reduce numRuns to make a property test pass

### Time isolation

- Never read the real clock in tests
- Pass `now` as an argument

## Wrong examples

### Test that only checks existence
```typescript
it('policy has healthAt', () => {
  expect(typeof policy.healthAt).toBe('function');
});
```
This proves nothing. The function could return random numbers and the test would pass.

### Try/catch that hides failure
```typescript
it('should calculate health correctly', () => {
  try {
    const health = policy.healthAt(item, now);
    expect(health).toBeGreaterThan(0);
  } catch (e) {
    // Test passes if an error is thrown
  }
});
```
This test passes whether the function works or throws an error.
