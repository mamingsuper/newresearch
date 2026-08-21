import test from 'node:test';
import assert from 'node:assert/strict';
import { MockIdeaAnalyzer } from '../src/analysis/mock-analyzer.mjs';
import { validateAnalysisReport, assertReportReferences } from '../src/domain/schema.mjs';

const evidence = [
  {
    paper: {
      id: 'paper-ai-trust',
      title: 'Generative AI Exposure and Political Trust',
      abstract: 'An online experiment studies AI exposure and political trust.',
      keywords: ['generative AI', 'political trust', 'experiment'],
      conference: { slug: 'ica', name: 'ICA', year: 2026 },
      sourceUrl: 'https://example.org/ai-trust',
    },
    score: 12,
    evidenceExcerpt: 'An online experiment studies AI exposure and political trust.',
    overlapTerms: ['ai', 'political', 'trust', 'experiment'],
  },
  {
    paper: {
      id: 'paper-literacy',
      title: 'AI Literacy and Synthetic Media Detection',
      abstract: 'A survey examines AI literacy as an individual difference.',
      keywords: ['AI literacy'],
      conference: { slug: 'apsa', name: 'APSA', year: 2026 },
      sourceUrl: 'https://example.org/literacy',
    },
    score: 6,
    evidenceExcerpt: 'A survey examines AI literacy as an individual difference.',
    overlapTerms: ['ai', 'literacy'],
  },
];

test('builds a conservative, evidence-referenced report', async () => {
  const analyzer = new MockIdeaAnalyzer();
  const report = await analyzer.analyze({
    idea: 'I want to test whether AI literacy moderates the effect of generative AI on political trust among young adults.',
    evidence,
    corpus: { conferences: ['ICA 2026', 'APSA 2026'], paperCount: 2 },
  });

  validateAnalysisReport(report);
  assertReportReferences(report, evidence.map((item) => item.paper.id));
  assert.match(report.coverageNotice, /currently indexed/i);
  assert.doesNotMatch(report.coverageNotice, /nobody|no one|never been done/i);
  assert.ok(report.closestWork.every((item) => item.paperId));
  assert.ok(report.innovationPaths.every((item) => item.kind === 'inference'));
  assert.ok(report.innovationPaths.some((item) => /moderator|mechanism|boundary/i.test(item.rationale)));
});
