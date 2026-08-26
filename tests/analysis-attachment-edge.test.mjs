import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_ANALYSIS_ATTACHMENT_BYTES,
  handleAnalysisAttachmentRequest,
} from '../supabase/functions/_shared/analysis-attachments.ts';

const allowedOrigins = new Set(['https://app.example']);
const anonymousId = 'f8d7cbf9-3bc6-45ea-8a90-0c7aa9a9942f';
const anonymousOwner = 'a'.repeat(64);

function request(file, fields = {}) {
  const form = new FormData();
  form.set('anonymousId', anonymousId);
  form.set('file', file);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request('https://project.supabase.co/functions/v1/extract-analysis-attachment', {
    method: 'POST',
    headers: { origin: 'https://app.example' },
    body: form,
  });
}

function dependencies(overrides = {}) {
  return {
    allowedOrigins,
    resolvePrincipal: async ({ suppliedAnonymousId }) => ({
      ownerKey: suppliedAnonymousId === anonymousId ? anonymousOwner : '',
      maxAttachments: 1,
    }),
    extractPdf: async () => 'Extracted PDF research context with enough meaningful words.',
    persist: async (value) => ({
      attachmentId: '8858c223-c17a-40f7-a2f8-f0b864acba2f',
      expiresAt: '2026-08-26T09:00:00.000Z',
      ...value,
    }),
    ...overrides,
  };
}

test('Markdown is parsed as transient untrusted text and persisted for the anonymous principal', async () => {
  let saved;
  const response = await handleAnalysisAttachmentRequest(
    request(new File(['# Notes\nA credible mechanism and research design for comparison.'], 'notes.md', { type: 'text/markdown' })),
    dependencies({ persist: async (value) => {
      saved = value;
      return { attachmentId: '8858c223-c17a-40f7-a2f8-f0b864acba2f', expiresAt: '2026-08-26T09:00:00.000Z' };
    } }),
  );
  assert.equal(response.status, 201);
  assert.equal(saved.ownerKey, anonymousOwner);
  assert.equal(saved.kind, 'markdown');
  assert.equal(saved.name, 'notes.md');
  assert.match(saved.extractedText, /credible mechanism/);
  assert.deepEqual(await response.json(), {
    data: {
      attachmentId: '8858c223-c17a-40f7-a2f8-f0b864acba2f',
      name: 'notes.md',
      kind: 'markdown',
      characters: 64,
      expiresAt: '2026-08-26T09:00:00.000Z',
    },
  });
});

test('PDF declaration without PDF magic bytes is rejected before extraction', async () => {
  let extracted = false;
  const response = await handleAnalysisAttachmentRequest(
    request(new File(['not a pdf'], 'paper.pdf', { type: 'application/pdf' })),
    dependencies({ extractPdf: async () => { extracted = true; return 'never'; } }),
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_FILE');
  assert.equal(extracted, false);
});

test('scanned PDF returns an actionable error without sending the file to an external provider', async () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  const response = await handleAnalysisAttachmentRequest(
    request(new File([bytes], 'scan.pdf', { type: 'application/pdf' })),
    dependencies({ extractPdf: async () => ' ' }),
  );
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'NO_READABLE_TEXT');
});

test('oversized and unsupported files fail with actionable safe errors', async () => {
  const oversized = await handleAnalysisAttachmentRequest(
    request(new File([new Uint8Array(MAX_ANALYSIS_ATTACHMENT_BYTES + 1)], 'large.txt', { type: 'text/plain' })),
    dependencies(),
  );
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, 'FILE_TOO_LARGE');

  const unsupported = await handleAnalysisAttachmentRequest(
    request(new File(['content'], 'notes.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })),
    dependencies(),
  );
  assert.equal(unsupported.status, 400);
  assert.equal((await unsupported.json()).error.code, 'UNSUPPORTED_TYPE');
});
