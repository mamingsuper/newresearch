import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalPaperRetriever } from '../src/retrieval/local-retriever.mjs';

const papers = [
  {
    id: 'paper-ai-trust',
    title: 'Generative AI Exposure and Political Trust',
    abstract: 'An online experiment studies how generative AI messages shape political trust among young adults.',
    keywords: ['generative AI', 'political trust', 'experiment'],
    conference: { slug: 'ica', name: 'ICA', year: 2026 },
    sourceUrl: 'https://example.org/ai-trust',
  },
  {
    id: 'paper-ai-literacy',
    title: 'AI Literacy and Synthetic Media Detection',
    abstract: 'A survey examines AI literacy and the detection of synthetic media.',
    keywords: ['AI literacy', 'synthetic media'],
    conference: { slug: 'apsa', name: 'APSA', year: 2026 },
    sourceUrl: 'https://example.org/ai-literacy',
  },
  {
    id: 'paper-health',
    title: 'Mobile Health Campaigns and Exercise',
    abstract: 'This study evaluates a mobile health campaign for physical activity.',
    keywords: ['health communication'],
    conference: { slug: 'ica', name: 'ICA', year: 2026 },
    sourceUrl: 'https://example.org/health',
  },
];

test('ranks the most directly overlapping paper first', async () => {
  const retriever = new LocalPaperRetriever(papers);
  const results = await retriever.search({
    query: 'I want to run an experiment on generative AI and political trust among young adults.',
    limit: 3,
  });

  assert.equal(results[0].paper.id, 'paper-ai-trust');
  assert.ok(results[0].score > results[1].score);
  assert.match(results[0].evidenceExcerpt, /generative AI messages shape political trust/i);
});

test('returns no evidence when no meaningful terms overlap', async () => {
  const retriever = new LocalPaperRetriever(papers);
  const results = await retriever.search({
    query: 'Archaeological ceramic isotope chronology in the Bronze Age.',
    limit: 5,
  });

  assert.deepEqual(results, []);
});
