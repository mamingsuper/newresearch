import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeepResearchPrompt,
  createApodexResearch,
  pollApodexResearch,
} from '../supabase/functions/_shared/apodex-research.ts';

const papers = [{
  paperId: 'paper-1',
  title: 'Political Polarization and Institutional Trust',
  conference: 'APSA 2026',
  abstract: 'A complete abstract about polarization, institutions, and public trust.',
  keywords: ['polarization', 'trust'],
  sourceUrl: 'https://example.org/paper-1',
  retrievalScore: 0.91,
}];

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('deep-research prompt preserves the idea, labels corpus evidence, and requires claim-level sources', () => {
  const prompt = buildDeepResearchPrompt({
    idea: 'Why does polarization reduce institutional trust?',
    papers,
  });

  assert.match(prompt, /Why does polarization reduce institutional trust\?/);
  assert.match(prompt, /Corpus source \[C1\]/);
  assert.match(prompt, /Political Polarization and Institutional Trust/);
  assert.match(prompt, /claim-level numbered citations/i);
  assert.match(prompt, /complete research memo/i);
  assert.match(prompt, /Sources/i);
  assert.match(prompt, /Do not expose hidden chain-of-thought/i);
});

test('create requests the latest Apodex background Responses model without streaming', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url: String(url), init, body: JSON.parse(String(init.body)) };
    return jsonResponse({ id: 'resp_apodex_123', status: 'queued' });
  };

  const result = await createApodexResearch(
    { idea: 'Why does polarization reduce institutional trust?', papers },
    { fetchImpl, apiKey: 'test-key' },
  );

  assert.equal(captured.url, 'https://api.apodex.ai/v1/responses');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.body.model, 'apodex-1-1-deep-research');
  assert.equal(captured.body.background, true);
  assert.equal(captured.body.stream, false);
  assert.match(captured.body.input, /Corpus source \[C1\]/);
  assert.deepEqual(result, { providerResponseId: 'resp_apodex_123', status: 'queued' });
});

test('poll preserves the complete final memo and normalizes safe web citations and actions', async () => {
  const completeMemo = '# Complete research memo\n\nA full, unabridged analysis with evidence [1].\n\n## Sources\n[1] Source.';
  const fetchImpl = async () => jsonResponse({
    id: 'resp_apodex_123',
    status: 'completed',
    output_text: completeMemo,
    output: [
      { type: 'web_search_call', status: 'completed', action: { query: 'polarization trust' } },
      { type: 'reasoning', summary: [{ text: 'private reasoning text must not be returned' }] },
      {
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'output_text',
          text: completeMemo,
          annotations: [{ type: 'url_citation', title: 'Source', url: 'https://example.org/source' }],
        }],
      },
    ],
    search_results: [
      { title: 'Source', url: 'https://example.org/source' },
      { title: 'Unsafe', url: 'javascript:alert(1)' },
    ],
  });

  const result = await pollApodexResearch('resp_apodex_123', { fetchImpl, apiKey: 'test-key' });

  assert.equal(result.status, 'completed');
  assert.equal(result.reportMarkdown, completeMemo);
  assert.deepEqual(result.webSources, [{ title: 'Source', url: 'https://example.org/source' }]);
  assert.deepEqual(result.researchActions, [
    { type: 'search', status: 'completed', label: 'Searching external literature' },
    { type: 'synthesis', status: 'completed', label: 'Synthesizing the evidence' },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /private reasoning text/);
});

test('429 responses honor Retry-After and stop after a bounded successful retry', async () => {
  let calls = 0;
  const delays = [];
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return jsonResponse({ error: { message: 'busy' } }, 429, { 'retry-after': '2' });
    return jsonResponse({ id: 'resp_apodex_123', status: 'in_progress', output: [] });
  };

  const result = await pollApodexResearch('resp_apodex_123', {
    fetchImpl,
    apiKey: 'test-key',
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    random: () => 0,
  });

  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
  assert.equal(result.status, 'researching');
  assert.equal(result.reportMarkdown, null);
});
