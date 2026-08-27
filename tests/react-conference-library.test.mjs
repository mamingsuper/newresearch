import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('conference library uses the mediated corpus endpoint with search, filters, and pagination', async () => {
  const [page, adapter] = await Promise.all([
    readFile(new URL('../frontend/src/pages/ConferenceLibrary.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../frontend/src/adapters/conferences.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(adapter, /publicEdgeFetch\(`corpus-library\?/);
  assert.doesNotMatch(adapter, /\.from\(["']papers["']\)/);
  assert.match(page, /type=["']search["']/);
  assert.match(page, /\["apsa", "APSA 2026"\]/);
  assert.match(page, /\["ica", "ICA 2026"\]/);
  assert.match(page, /\["epss", "EPSS 2026"\]/);
  assert.match(page, /sourceUrl/);
  assert.match(page, /setPage/);
});
