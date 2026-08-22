import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_PAPERS } from '../src/fixtures/sample-papers.mjs';
import { buildEmbeddingText, embeddingInputHash } from '../src/corpus/embedding-text.mjs';
import { validateCorpusStats } from '../src/corpus/stats.mjs';

test('embedding text is deterministic and includes only retrieval-relevant paper fields', () => {
  const paper = SAMPLE_PAPERS[0];
  const first = buildEmbeddingText(paper);
  const second = buildEmbeddingText({ ...paper, sourceUrl: 'https://example.org/changed' });
  assert.equal(first, second);
  assert.match(first, /^Title: Generative AI Exposure and Political Trust/m);
  assert.match(first, /Conference: ICA 2026/);
  assert.match(first, /Division: Political Communication/);
  assert.match(first, /Keywords: generative AI, political trust, experiment, young adults/);
  assert.match(first, /Abstract: A preregistered online experiment/);
  assert.doesNotMatch(first, /Demo Author/);
  assert.doesNotMatch(first, /example\.org/);
});

test('embedding input hash changes only when embedding text changes', () => {
  const paper = SAMPLE_PAPERS[0];
  assert.equal(embeddingInputHash(paper), embeddingInputHash({ ...paper, retrievedAt: new Date().toISOString() }));
  assert.notEqual(embeddingInputHash(paper), embeddingInputHash({ ...paper, abstract: `${paper.abstract} Added sentence.` }));
});

test('corpus stats validation normalizes the live readiness contract', () => {
  const stats = validateCorpusStats({
    conferences: [{ slug: 'ica', name: 'ICA', year: 2026, papers: 3 }],
    paperCount: 3, papersWithAbstract: 3, embeddedPaperCount: 2, pendingEmbeddingCount: 1, failedEmbeddingCount: 0,
    latestSuccessfulIngestionAt: '2026-08-22T10:00:00.000Z', ready: true,
  });
  assert.equal(stats.paperCount, 3); assert.equal(stats.conferences[0].slug, 'ica'); assert.equal(stats.ready, true);
});

test('corpus stats rejects inconsistent negative counts', () => {
  assert.throws(() => validateCorpusStats({
    conferences: [], paperCount: -1, papersWithAbstract: 0, embeddedPaperCount: 0,
    pendingEmbeddingCount: 0, failedEmbeddingCount: 0, latestSuccessfulIngestionAt: null, ready: false,
  }), /paperCount/);
});
