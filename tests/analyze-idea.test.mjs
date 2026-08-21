import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeIdea } from '../src/pipeline/analyze-idea.mjs';
import { ValidationError } from '../src/domain/schema.mjs';

test('skips the analyzer when retrieval returns no evidence', async () => {
  let analyzerCalled = false;
  const report = await analyzeIdea(
    { idea: 'I want to examine an entirely unmatched research question.' },
    {
      retriever: { search: async () => [] },
      analyzer: {
        analyze: async () => {
          analyzerCalled = true;
          throw new Error('should not be called');
        },
      },
      corpus: { conferences: ['ICA 2026', 'APSA 2026'], paperCount: 0 },
    },
  );

  assert.equal(analyzerCalled, false);
  assert.deepEqual(report.closestWork, []);
  assert.match(report.coverageNotice, /no direct match was found/i);
});

test('rejects an analyzer report that cites an unretrieved paper', async () => {
  const evidence = [
    {
      paper: {
        id: 'allowed-paper',
        title: 'Allowed evidence',
        abstract: 'This abstract is long enough for the test.',
        keywords: ['evidence'],
        conference: { slug: 'ica', name: 'ICA', year: 2026 },
        sourceUrl: 'https://example.org/allowed',
      },
      score: 1,
      evidenceExcerpt: 'This abstract is long enough for the test.',
      overlapTerms: ['evidence'],
    },
  ];

  const invalidReport = {
    ideaProfile: {
      summary: 'A sufficiently long research idea for validation.',
      topics: ['evidence'],
      population: null,
      method: null,
      mechanisms: [],
    },
    coverageNotice: 'Currently indexed corpus only.',
    closestWork: [
      {
        paperId: 'invented-paper',
        title: 'Invented',
        conference: 'ICA 2026',
        relationship: 'Closest',
        overlapDimensions: ['topic'],
        evidence: 'Invented evidence.',
        sourceUrl: 'https://example.org/invented',
      },
    ],
    innovationPaths: [],
    recommendedNextSteps: [],
    limitations: ['Conference abstracts only.'],
  };

  await assert.rejects(
    () =>
      analyzeIdea(
        { idea: 'A sufficiently long research idea for validation.' },
        {
          retriever: { search: async () => evidence },
          analyzer: { analyze: async () => invalidReport },
          corpus: { conferences: ['ICA 2026'], paperCount: 1 },
        },
      ),
    ValidationError,
  );
});

test('replaces model-supplied paper metadata with canonical retrieved evidence', async () => {
  const evidence = [
    {
      paper: {
        id: 'canonical-paper',
        title: 'Canonical Conference Title',
        abstract: 'This canonical abstract provides the source evidence for the report.',
        keywords: ['canonical'],
        conference: { slug: 'apsa', name: 'APSA', year: 2026 },
        sourceUrl: 'https://example.org/canonical-paper',
      },
      score: 1,
      evidenceExcerpt: 'This canonical abstract provides the source evidence for the report.',
      overlapTerms: ['canonical'],
    },
  ];
  const modelReport = {
    ideaProfile: {
      summary: 'A sufficiently detailed research idea about canonical evidence.',
      topics: ['canonical evidence'],
      population: null,
      method: null,
      mechanisms: [],
    },
    coverageNotice: 'Currently indexed corpus only.',
    closestWork: [
      {
        paperId: 'canonical-paper',
        title: 'Fabricated title',
        conference: 'Fabricated conference',
        relationship: 'Closest corpus match',
        overlapDimensions: ['topic'],
        evidence: 'Fabricated evidence text.',
        sourceUrl: 'https://malicious.example/fabricated',
      },
    ],
    innovationPaths: [],
    recommendedNextSteps: [],
    limitations: ['Conference abstracts only.'],
  };

  const report = await analyzeIdea(
    { idea: 'A sufficiently detailed research idea about canonical evidence.' },
    {
      retriever: { search: async () => evidence },
      analyzer: { analyze: async () => modelReport },
      corpus: { conferences: ['APSA 2026'], paperCount: 1 },
    },
  );

  assert.equal(report.closestWork[0].title, 'Canonical Conference Title');
  assert.equal(report.closestWork[0].conference, 'APSA 2026');
  assert.equal(report.closestWork[0].evidence, evidence[0].evidenceExcerpt);
  assert.equal(report.closestWork[0].sourceUrl, 'https://example.org/canonical-paper');
});
