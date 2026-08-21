import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createRequestHandler } from '../src/app/create-app.mjs';
import { LocalPaperRetriever } from '../src/retrieval/local-retriever.mjs';
import { MockIdeaAnalyzer } from '../src/analysis/mock-analyzer.mjs';
import { SAMPLE_PAPERS } from '../src/fixtures/sample-papers.mjs';

async function withServer(run, overrides = {}, handlerOptions = {}) {
  const logs = [];
  const services = {
    mode: 'mock',
    retriever: new LocalPaperRetriever(SAMPLE_PAPERS),
    analyzer: new MockIdeaAnalyzer(),
    corpus: {
      conferences: ['ICA 2026', 'APSA 2026'],
      paperCount: SAMPLE_PAPERS.length,
    },
    ...overrides,
  };
  const handler = createRequestHandler({
    services,
    publicDir: null,
    logger: { error: (entry) => logs.push(entry) },
    ...handlerOptions,
  });
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`, logs);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('health endpoint reports the active mode', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.data.status, 'ok');
    assert.equal(payload.data.mode, 'mock');
  });
});

test('analysis endpoint returns a structured report', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        idea: 'I want to test whether AI literacy moderates generative AI effects on political trust among young adults.',
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.ok(payload.data.closestWork.length > 0);
    assert.equal(payload.data.closestWork[0].paperId, 'demo-ica-2026-ai-trust');
  });
});

test('invalid ideas return a stable 400 response', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idea: 'too short' }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error.code, 'INVALID_REQUEST');
    assert.match(payload.error.requestId, /^[0-9a-f-]{36}$/i);
  });
});

test('server errors do not log the raw idea', async () => {
  const secretIdea = 'Confidential unpublished idea about elite persuasion and private survey data.';
  await withServer(
    async (baseUrl, logs) => {
      const response = await fetch(`${baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idea: secretIdea }),
      });

      assert.equal(response.status, 502);
      assert.doesNotMatch(JSON.stringify(logs), new RegExp(secretIdea));
    },
    {
      retriever: {
        search: async () => {
          throw new Error(`retrieval failed while processing: ${secretIdea}`);
        },
      },
    },
  );
});

test('analysis endpoint returns 429 when the request limiter is exhausted', async () => {
  const rateLimiter = {
    consume: () => ({ allowed: false, remaining: 0, retryAfterSeconds: 42 }),
  };

  await withServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idea: 'A sufficiently detailed idea that should be rejected by rate limiting.',
        }),
      });
      const payload = await response.json();

      assert.equal(response.status, 429);
      assert.equal(response.headers.get('retry-after'), '42');
      assert.equal(payload.error.code, 'RATE_LIMITED');
    },
    {},
    { rateLimiter },
  );
});
