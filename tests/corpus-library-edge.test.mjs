import test from 'node:test';
import assert from 'node:assert/strict';

import { handleCorpusLibraryRequest, parseCorpusLibraryQuery } from '../supabase/functions/_shared/corpus-library.ts';

test('corpus library query is bounded and normalized', () => {
  assert.deepEqual(parseCorpusLibraryQuery(new URL('https://example.test/?q= polarization &conference=apsa-2026&page=2')), {
    query: 'polarization',
    conferenceSlug: 'apsa-2026',
    page: 2,
    limit: 20,
    offset: 20,
  });
  assert.throws(() => parseCorpusLibraryQuery(new URL(`https://example.test/?q=${'x'.repeat(201)}`)), /invalid_library_query/);
  assert.throws(() => parseCorpusLibraryQuery(new URL('https://example.test/?conference=APSA%202026')), /invalid_library_query/);
  assert.throws(() => parseCorpusLibraryQuery(new URL('https://example.test/?page=0')), /invalid_library_query/);
});

test('corpus library returns only allowlisted public paper fields', async () => {
  const response = await handleCorpusLibraryRequest(new Request('http://localhost:3000/?q=polarization'), {
    rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    browse: async () => ({
      total: 1,
      papers: [{
        id: 'paper-1', title: 'Polarization', abstract: 'Evidence.', authors: [{ name: 'A' }],
        conferenceSlug: 'apsa-2026', conferenceName: 'APSA', conferenceYear: 2026,
        division: 'Political Communication', keywords: ['polarization'], sourceUrl: 'https://example.test/paper',
        raw_hash: 'secret', embedding: [1, 2, 3],
      }],
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.total, 1);
  assert.equal(body.data.page, 1);
  assert.equal(body.data.papers[0].title, 'Polarization');
  assert.equal(body.data.papers[0].raw_hash, undefined);
  assert.equal(body.data.papers[0].embedding, undefined);
  assert.match(response.headers.get('cache-control'), /public/);
});

test('corpus library rejects excess traffic without querying papers', async () => {
  let queried = false;
  const response = await handleCorpusLibraryRequest(new Request('http://localhost:3000/'), {
    rateLimit: async () => ({ allowed: false, retryAfterSeconds: 12 }),
    browse: async () => { queried = true; return { total: 0, papers: [] }; },
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '12');
  assert.equal(queried, false);
});
