import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { parseAnalysisRequestBody } from '../supabase/functions/_shared/idea-radar.ts';

const anonymousId = 'f8d7cbf9-3bc6-45ea-8a90-0c7aa9a9942f';
const attachmentId = '8858c223-c17a-40f7-a2f8-f0b864acba2f';

test('anonymous default request accepts the fixed five-paper preview and one attachment', () => {
  assert.deepEqual(parseAnalysisRequestBody({
    idea: 'How does algorithmic curation affect political learning outcomes?',
    model: 'default',
    effort: 'standard',
    matchCount: 5,
    anonymousId,
    attachmentIds: [attachmentId],
    clientRequestId: '263adf7e-6710-4efe-b64f-73404fcf6b6a',
    externalProcessingConsent: false,
  }), {
    idea: 'How does algorithmic curation affect political learning outcomes?',
    model: 'default',
    effort: 'standard',
    matchCount: 5,
    anonymousId,
    attachmentIds: [attachmentId],
    clientRequestId: '263adf7e-6710-4efe-b64f-73404fcf6b6a',
    externalProcessingConsent: false,
  });
});

test('anonymous requests cannot select paid models or multiple attachments', () => {
  assert.throws(() => parseAnalysisRequestBody({
    idea: 'How does algorithmic curation affect political learning outcomes?',
    model: 'super_apodex',
    matchCount: 5,
    anonymousId,
    attachmentIds: [attachmentId],
    clientRequestId: '263adf7e-6710-4efe-b64f-73404fcf6b6a',
    externalProcessingConsent: true,
  }), /invalid_analysis_options/);

  assert.throws(() => parseAnalysisRequestBody({
    idea: 'How does algorithmic curation affect political learning outcomes?',
    model: 'default',
    matchCount: 5,
    anonymousId,
    attachmentIds: [attachmentId, '2bfc4686-a403-4b87-818f-8fe405d22f07'],
    clientRequestId: '263adf7e-6710-4efe-b64f-73404fcf6b6a',
  }), /invalid_analysis_options/);
});

test('analysis handler authorizes an anonymous preview and consumes only owned attachment text', async () => {
  const source = await readFile(new URL('../supabase/functions/_shared/idea-radar.ts', import.meta.url), 'utf8');
  assert.match(source, /authorize_anonymous_analysis/);
  assert.match(source, /consume_analysis_attachments/);
  assert.match(source, /attachmentSearchTerms/);
  assert.doesNotMatch(source, /userAttachments\s*:/);
  assert.match(source, /ANONYMOUS_PREVIEW_USED/);
  assert.match(source, /throw new Error\(['"]corpus_not_ready['"]\)/);
  assert.match(source, /release_anonymous_analysis/);
});
