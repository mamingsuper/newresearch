import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_ANALYSIS_FILE_BYTES,
  analysisAccessFor,
  validateAnalysisAttachment,
} from '../frontend/src/lib/analysis-policy.ts';

test('anonymous analysis is one five-paper preview with one attachment', () => {
  assert.deepEqual(analysisAccessFor(null), {
    tier: 'anonymous',
    matchCounts: [5],
    defaultMatchCount: 5,
    maxAttachments: 1,
    canUseSuper: false,
    quotaLabel: '1 preview',
  });
});

test('signed-in Free and Pro access expose only their purchased evidence depth', () => {
  const free = analysisAccessFor({ plan: 'free', analysesRemainingToday: 1 });
  const pro = analysisAccessFor({ plan: 'pro', analysesRemainingToday: 30 });

  assert.deepEqual(free.matchCounts, [10]);
  assert.equal(free.maxAttachments, 3);
  assert.equal(free.canUseSuper, false);
  assert.equal(free.quotaLabel, '1 today');

  assert.deepEqual(pro.matchCounts, [20, 100]);
  assert.equal(pro.defaultMatchCount, 20);
  assert.equal(pro.maxAttachments, 3);
  assert.equal(pro.canUseSuper, true);
  assert.equal(pro.quotaLabel, 'Unlimited');
});

test('analysis attachments accept bounded PDF, Markdown, and text files', () => {
  for (const file of [
    { name: 'paper.pdf', size: 1200, type: 'application/pdf' },
    { name: 'notes.md', size: 800, type: 'text/markdown' },
    { name: 'context.markdown', size: 700, type: '' },
    { name: 'ideas.txt', size: 600, type: 'text/plain' },
  ]) {
    assert.deepEqual(validateAnalysisAttachment(file), { ok: true });
  }

  assert.deepEqual(
    validateAnalysisAttachment({ name: 'archive.zip', size: 1200, type: 'application/zip' }),
    { ok: false, code: 'UNSUPPORTED_TYPE' },
  );
  assert.deepEqual(
    validateAnalysisAttachment({ name: 'paper.pdf', size: MAX_ANALYSIS_FILE_BYTES + 1, type: 'application/pdf' }),
    { ok: false, code: 'FILE_TOO_LARGE' },
  );
  assert.deepEqual(
    validateAnalysisAttachment({ name: '../paper.pdf', size: 1200, type: 'application/pdf' }),
    { ok: false, code: 'INVALID_NAME' },
  );
});
