import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRateLimiter } from '../src/app/rate-limiter.mjs';

test('allows requests up to the fixed-window limit and then returns retry guidance', () => {
  let now = 1_000;
  const limiter = new InMemoryRateLimiter({
    limit: 2,
    windowMs: 10_000,
    now: () => now,
  });

  assert.deepEqual(limiter.consume('client-a'), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 0,
  });
  assert.deepEqual(limiter.consume('client-a'), {
    allowed: true,
    remaining: 0,
    retryAfterSeconds: 0,
  });
  assert.deepEqual(limiter.consume('client-a'), {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: 10,
  });

  now += 10_001;
  assert.equal(limiter.consume('client-a').allowed, true);
});

test('tracks clients independently', () => {
  const limiter = new InMemoryRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });

  assert.equal(limiter.consume('client-a').allowed, true);
  assert.equal(limiter.consume('client-a').allowed, false);
  assert.equal(limiter.consume('client-b').allowed, true);
});

test('periodically removes expired client buckets', () => {
  let now = 0;
  const limiter = new InMemoryRateLimiter({
    limit: 1,
    windowMs: 1_000,
    sweepEvery: 2,
    now: () => now,
  });

  limiter.consume('expired-client');
  assert.equal(limiter.buckets.has('expired-client'), true);

  now = 1_001;
  limiter.consume('current-client');

  assert.equal(limiter.buckets.has('expired-client'), false);
  assert.equal(limiter.buckets.has('current-client'), true);
});
