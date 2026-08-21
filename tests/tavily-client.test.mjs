import test from 'node:test';
import assert from 'node:assert/strict';
import { TavilyClient } from '../src/tavily/client.mjs';

test('search sends authentication and project tracking headers', async () => {
  const requests = [];
  const client = new TavilyClient({
    apiKey: 'tvly-test',
    projectId: 'radar-project',
    fetchImpl: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ results: [{ url: 'https://conference.example/program' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await client.searchConferences('2027 social science annual meeting program abstracts');

  assert.equal(result.results.length, 1);
  assert.equal(requests[0].url, 'https://api.tavily.com/search');
  assert.equal(requests[0].init.headers.authorization, 'Bearer tvly-test');
  assert.equal(requests[0].init.headers['x-project-id'], 'radar-project');
  assert.equal(requests[0].body.max_results, 10);
});

test('crawl uses bounded, same-site defaults', async () => {
  const requests = [];
  const client = new TavilyClient({
    apiKey: 'tvly-test',
    fetchImpl: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ base_url: 'conference.example', results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  await client.crawlConference('https://conference.example/program');

  assert.equal(requests[0].url, 'https://api.tavily.com/crawl');
  assert.equal(requests[0].body.max_depth, 1);
  assert.equal(requests[0].body.max_breadth, 20);
  assert.equal(requests[0].body.limit, 50);
  assert.equal(requests[0].body.allow_external, false);
  assert.equal(requests[0].body.extract_depth, 'basic');
  assert.equal(requests[0].body.format, 'markdown');
});

test('surfaces a useful error for a non-success response', async () => {
  const client = new TavilyClient({
    apiKey: 'tvly-test',
    fetchImpl: async () => new Response('rate limited', { status: 429 }),
  });

  await assert.rejects(
    () => client.searchConferences('conference program'),
    /Tavily search.*HTTP 429/i,
  );
});
