function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

export class InMemoryRateLimiter {
  constructor({
    limit = 10,
    windowMs = 60_000,
    sweepEvery = 100,
    now = Date.now,
  } = {}) {
    this.limit = requirePositiveInteger(limit, 'limit');
    this.windowMs = requirePositiveInteger(windowMs, 'windowMs');
    this.sweepEvery = requirePositiveInteger(sweepEvery, 'sweepEvery');
    if (typeof now !== 'function') throw new TypeError('now must be a function');
    this.now = now;
    this.operations = 0;
    this.buckets = new Map();
  }

  sweepExpired(timestamp) {
    for (const [key, bucket] of this.buckets) {
      if (timestamp >= bucket.resetAt) this.buckets.delete(key);
    }
  }

  consume(key) {
    const timestamp = this.now();
    this.operations += 1;
    if (this.operations % this.sweepEvery === 0) this.sweepExpired(timestamp);

    const clientKey = String(key || 'unknown');
    let bucket = this.buckets.get(clientKey);

    if (!bucket || timestamp >= bucket.resetAt) {
      bucket = { count: 0, resetAt: timestamp + this.windowMs };
    }

    if (bucket.count >= this.limit) {
      this.buckets.set(clientKey, bucket);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.resetAt - timestamp) / 1000),
        ),
      };
    }

    bucket.count += 1;
    this.buckets.set(clientKey, bucket);
    return {
      allowed: true,
      remaining: this.limit - bucket.count,
      retryAfterSeconds: 0,
    };
  }
}
