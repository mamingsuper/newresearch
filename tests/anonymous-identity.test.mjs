import test from 'node:test';
import assert from 'node:assert/strict';

import { getOrCreateAnonymousId } from '../frontend/src/lib/anonymous-identity.ts';

test('anonymous browser identity is created once and reused', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  let calls = 0;
  const randomUUID = () => {
    calls += 1;
    return 'f8d7cbf9-3bc6-45ea-8a90-0c7aa9a9942f';
  };

  assert.equal(getOrCreateAnonymousId(storage, randomUUID), 'f8d7cbf9-3bc6-45ea-8a90-0c7aa9a9942f');
  assert.equal(getOrCreateAnonymousId(storage, randomUUID), 'f8d7cbf9-3bc6-45ea-8a90-0c7aa9a9942f');
  assert.equal(calls, 1);
});

test('invalid stored identity is replaced instead of sent to the server', () => {
  const values = new Map([['idea-radar-anonymous-id', 'tampered']]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const id = getOrCreateAnonymousId(storage, () => '263adf7e-6710-4efe-b64f-73404fcf6b6a');
  assert.equal(id, '263adf7e-6710-4efe-b64f-73404fcf6b6a');
  assert.equal(values.get('idea-radar-anonymous-id'), id);
});
