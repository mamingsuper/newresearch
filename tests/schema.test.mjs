import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidationError,
  validateAnalysisReport,
  validateAnalyzeIdeaRequest,
  validatePaperRecord,
} from '../src/domain/schema.mjs';

test('paper validation requires provenance source URL', () => {
  const paper = {
    id: 'apsa-2026-1',
    sourceRecordId: '1',
    conference: { slug: 'apsa', name: 'APSA', year: 2026 },
    title: 'A paper',
    abstract: 'A sufficiently informative abstract.',
    authors: [{ name: 'Ada Scholar', affiliation: null }],
    division: null,
    sessionTitle: null,
    sessionType: null,
    sourceUrl: '',
    retrievedAt: '2026-08-21T00:00:00.000Z',
    rawHash: 'abc123',
    keywords: [],
  };

  assert.throws(() => validatePaperRecord(paper), ValidationError);
});

test('analysis request rejects ideas shorter than twenty characters', () => {
  assert.throws(
    () => validateAnalyzeIdeaRequest({ idea: 'AI and trust' }),
    /at least 20 characters/i,
  );
});

test('analysis report requires a non-empty paper reference', () => {
  const report = {
    ideaProfile: {
      summary: 'Study AI and political trust.',
      topics: ['AI', 'political trust'],
      population: null,
      method: null,
      mechanisms: [],
    },
    coverageNotice: 'No global novelty claim is made.',
    closestWork: [
      {
        paperId: '',
        title: 'Related paper',
        conference: 'ICA 2026',
        relationship: 'Direct overlap',
        overlapDimensions: ['topic'],
        evidence: 'The abstract studies AI and trust.',
        sourceUrl: 'https://example.org/paper/1',
      },
    ],
    innovationPaths: [],
    recommendedNextSteps: ['Read the paper.'],
    limitations: ['Conference abstracts only.'],
  };

  assert.throws(() => validateAnalysisReport(report), /paperId/i);
});
