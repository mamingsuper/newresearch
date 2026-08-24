import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createProgramSubmissionController,
  readSubmissionDraft,
  serializeSubmissionDraft,
  validateProgramSubmissionForm,
} from '../public/program-submission.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const UPLOAD_ID = '22222222-2222-4222-8222-222222222222';
const SUBMISSION_ID = '33333333-3333-4333-8333-333333333333';
const DAY_MS = 24 * 60 * 60 * 1000;

const baseFields = {
  conferenceName: 'International Communication Association',
  acronym: 'ICA',
  year: '2027',
  discipline: 'Communication',
  officialConferenceUrl: 'https://ica.example.org/2027',
  notes: 'Official annual meeting program.',
  rightsAttested: true,
  kind: 'url',
  programUrl: 'https://ica.example.org/2027/program',
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); },
  };
}

function fakeFile({ name = 'program.json', type = 'application/json', bytes = '{"papers":[]}\n' } = {}) {
  const data = new TextEncoder().encode(bytes);
  return {
    name,
    type,
    size: data.byteLength,
    async arrayBuffer() { return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); },
  };
}

test('seven-day draft contains only allowlisted text metadata and never file bytes or tokens', () => {
  const encoded = serializeSubmissionDraft({
    ...baseFields,
    file: new Uint8Array([1, 2, 3]),
    accessToken: 'secret-user-jwt',
    sha256: 'a'.repeat(64),
    storagePath: `${USER_ID}/${UPLOAD_ID}/program.json`,
  }, 1_000);
  assert.doesNotMatch(encoded, /1,2,3|secret-user-jwt|sha256|storagePath|rightsAttested/i);
  assert.deepEqual(readSubmissionDraft(encoded, 1_000 + 7 * DAY_MS), {
    conferenceName: baseFields.conferenceName,
    acronym: 'ICA',
    year: '2027',
    discipline: 'Communication',
    officialConferenceUrl: baseFields.officialConferenceUrl,
    notes: baseFields.notes,
    kind: 'url',
    programUrl: baseFields.programUrl,
  });
  assert.equal(readSubmissionDraft(encoded, 1_000 + 7 * DAY_MS + 1), null);
});

test('field validation rejects unsafe URLs, missing rights, and mismatched files', () => {
  const urlResult = validateProgramSubmissionForm({
    ...baseFields,
    officialConferenceUrl: 'http://localhost/conference',
    programUrl: 'https://user:pass@example.org/program#fragment',
    rightsAttested: false,
  });
  assert.deepEqual(urlResult.errors, {
    officialConferenceUrl: 'https',
    programUrl: 'https',
    rightsAttested: 'rights',
  });

  const fileResult = validateProgramSubmissionForm({ ...baseFields, kind: 'file', programUrl: '' }, fakeFile({ name: 'program.pdf', type: 'application/zip' }));
  assert.equal(fileResult.errors.file, 'fileType');
});

test('file submission hashes bytes, uploads to an owner path, reports progress, and sends exact API fields', async () => {
  const drafts = memoryStorage();
  const uploads = [];
  const requests = [];
  const states = [];
  const controller = createProgramSubmissionController({
    auth: { getUserId: () => USER_ID, getAccessToken: async () => 'fresh-jwt' },
    storage: {
      async upload(input) { uploads.push(input); input.onProgress(50); input.onProgress(100); },
      async remove() {},
    },
    api: {
      async submit(payload, options) {
        requests.push({ payload, options });
        return { submissionId: SUBMISSION_ID, status: 'submitted', submittedAt: '2026-08-23T00:00:00Z' };
      },
    },
    draftStorage: drafts,
    randomUUID: () => UPLOAD_ID,
    onStateChange: (state) => states.push(state),
  });
  const file = fakeFile();
  const result = await controller.submit({ fields: { ...baseFields, kind: 'file', programUrl: '' }, file });

  assert.equal(result.submissionId, SUBMISSION_ID);
  assert.equal(uploads[0].path, `${USER_ID}/${UPLOAD_ID}/program.json`);
  assert.equal(uploads[0].mimeType, 'application/json');
  assert.equal(requests[0].options.accessToken, 'fresh-jwt');
  assert.deepEqual(Object.keys(requests[0].payload).sort(), [
    'acronym', 'conferenceName', 'discipline', 'fileName', 'fileSizeBytes', 'kind', 'mimeType',
    'notes', 'officialConferenceUrl', 'rightsAttested', 'sha256', 'storagePath', 'year',
  ]);
  assert.match(requests[0].payload.sha256, /^[0-9a-f]{64}$/);
  assert.equal(requests[0].payload.rightsAttested, true);
  assert.equal(JSON.stringify(requests).includes('userId'), false);
  assert.equal(drafts.getItem('idea-radar-program-draft'), null);
  assert.ok(states.some((state) => state.status === 'uploading' && state.progress > 0));
  assert.equal(controller.state().status, 'success');
});

test('API failure retries without re-upload and can clean the orphan object', async () => {
  let apiAttempts = 0;
  let uploadCount = 0;
  const removed = [];
  const controller = createProgramSubmissionController({
    auth: { getUserId: () => USER_ID, getAccessToken: async () => 'jwt' },
    storage: {
      async upload({ onProgress }) { uploadCount += 1; onProgress(100); },
      async remove(path) { removed.push(path); },
    },
    api: {
      async submit() {
        apiAttempts += 1;
        if (apiAttempts === 1) throw new Error('private provider detail');
        return { submissionId: SUBMISSION_ID, status: 'submitted', submittedAt: 'now' };
      },
    },
    draftStorage: memoryStorage(),
    randomUUID: () => UPLOAD_ID,
  });
  const input = { fields: { ...baseFields, kind: 'file', programUrl: '' }, file: fakeFile() };
  await assert.rejects(() => controller.submit(input), { code: 'program_submission_api_failed' });
  assert.deepEqual(controller.state(), {
    status: 'error', progress: 100, errorCode: 'api', canRetry: true, orphan: true, result: null,
  });
  await controller.retry();
  assert.equal(uploadCount, 1);
  assert.equal(apiAttempts, 2);

  apiAttempts = 0;
  await assert.rejects(() => controller.submit(input), { code: 'program_submission_api_failed' });
  await controller.cleanupOrphan();
  assert.deepEqual(removed, [`${USER_ID}/${UPLOAD_ID}/program.json`]);
  assert.equal(controller.state().orphan, false);
});

test('anonymous submission fails closed before storage or API calls', async () => {
  let calls = 0;
  const controller = createProgramSubmissionController({
    auth: { getUserId: () => null, getAccessToken: async () => null },
    storage: { async upload() { calls += 1; }, async remove() { calls += 1; } },
    api: { async submit() { calls += 1; } },
  });
  await assert.rejects(() => controller.submit({ fields: baseFields }), { code: 'program_submission_auth_required' });
  assert.equal(calls, 0);
});

test('page exposes accessible bilingual URL/file form and safe Auth restoration', async () => {
  const [html, app, i18n, authClient] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/i18n.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/auth-client.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="program-submission-form"[^>]*novalidate/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /data-program-kind="url"[^>]*aria-selected="true"/);
  assert.match(html, /data-program-kind="file"[^>]*aria-selected="false"/);
  assert.match(html, /id="program-rights"[^>]*type="checkbox"/);
  assert.match(html, /id="program-upload-progress"[^>]*max="100"/);
  assert.match(html, /data-program-error-for="conferenceName"/);
  assert.match(app, /requestAccountAction\('submit-program'/);
  assert.match(app, /createProgramSubmissionController/);
  assert.match(authClient, /'submit-program'/);
  for (const key of ['program.title', 'program.kind.url', 'program.kind.file', 'program.rights', 'program.submit', 'program.status.success']) {
    assert.equal((i18n.match(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g')) ?? []).length, 2, key);
  }
});
