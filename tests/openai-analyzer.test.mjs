import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIAnalyzer } from '../src/analysis/openai-analyzer.mjs';

const evidence = [
  {
    paper: {
      id: 'paper-1',
      title: 'AI and Trust',
      abstract: 'An experiment examines AI messages and political trust.',
      keywords: ['AI', 'political trust'],
      conference: { slug: 'ica', name: 'ICA', year: 2026 },
      sourceUrl: 'https://example.org/paper-1',
    },
    score: 1,
    evidenceExcerpt: 'An experiment examines AI messages and political trust.',
    overlapTerms: ['ai', 'trust'],
  },
];

const validReport = {
  ideaProfile: {
    summary: 'Study AI and political trust using an experiment.',
    topics: ['AI', 'political trust'],
    population: null,
    method: 'experiment',
    mechanisms: [],
  },
  coverageNotice: 'This result is limited to the currently indexed ICA 2026 corpus.',
  closestWork: [
    {
      paperId: 'paper-1',
      title: 'AI and Trust',
      conference: 'ICA 2026',
      relationship: 'Closest corpus match',
      overlapDimensions: ['topic', 'method'],
      evidence: 'An experiment examines AI messages and political trust.',
      sourceUrl: 'https://example.org/paper-1',
    },
  ],
  innovationPaths: [
    {
      title: 'Specify the mechanism',
      rationale: 'This is an inference based on the retrieved abstract.',
      evidencePaperIds: ['paper-1'],
      kind: 'inference',
    },
  ],
  recommendedNextSteps: ['Read the source record.'],
  limitations: ['Conference abstracts only.'],
};

test('uses structured Responses output, disables storage, and grounds the prompt', async () => {
  const requests = [];
  const analyzer = new OpenAIAnalyzer({
    apiKey: 'test-key',
    model: 'gpt-test',
    fetchImpl: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return new Response(
        JSON.stringify({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: JSON.stringify(validReport) }],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });

  const report = await analyzer.analyze({
    idea: 'I want to run an experiment about AI and political trust.',
    evidence,
    corpus: { conferences: ['ICA 2026'], paperCount: 1 },
  });

  assert.equal(report.closestWork[0].paperId, 'paper-1');
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(requests[0].body.model, 'gpt-test');
  assert.equal(requests[0].body.store, false);
  assert.equal(requests[0].body.max_output_tokens, 1800);
  assert.equal(requests[0].body.text.format.type, 'json_schema');
  assert.equal(requests[0].body.text.format.strict, true);
  const prompt = JSON.stringify(requests[0].body.input);
  assert.match(prompt, /paper-1/);
  assert.match(prompt, /never claim|do not claim/i);
  assert.match(prompt, /currently indexed/i);
  assert.match(prompt, /untrusted data|embedded instructions/i);
});

test('rejects a structured response that cites an unknown paper', async () => {
  const invalid = structuredClone(validReport);
  invalid.closestWork[0].paperId = 'unknown-paper';
  const analyzer = new OpenAIAnalyzer({
    apiKey: 'test-key',
    fetchImpl: async () =>
      new Response(JSON.stringify({ output_text: JSON.stringify(invalid) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });

  await assert.rejects(
    () =>
      analyzer.analyze({
        idea: 'A sufficiently detailed idea about AI and political trust.',
        evidence,
        corpus: { conferences: ['ICA 2026'], paperCount: 1 },
      }),
    /unknown paper/i,
  );
});
