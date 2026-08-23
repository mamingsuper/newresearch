import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleSubmitProgramRequest } from '../supabase/functions/submit-program/index.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SUBMISSION_ID = '22222222-2222-4222-8222-222222222222';
const encoder = new TextEncoder();

function urlInput(overrides = {}) {
  return {
    conferenceName: 'International Communication Association',
    acronym: 'ICA',
    year: 2026,
    discipline: 'Communication',
    officialConferenceUrl: 'https://www.icahdq.org/conference',
    notes: 'Official program URL.',
    rightsAttested: true,
    kind: 'url',
    programUrl: 'https://program.icahdq.org/2026',
    ...overrides,
  };
}

function pdfBytes() {
  return encoder.encode('%PDF-1.7\nprogram');
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fileInput(overrides = {}) {
  const bytes = pdfBytes();
  return {
    ...urlInput(),
    kind: 'file',
    programUrl: undefined,
    storagePath: `${USER_ID}/${SUBMISSION_ID}/program.pdf`,
    fileName: 'program.pdf',
    fileSizeBytes: bytes.length,
    mimeType: 'application/pdf',
    sha256: await sha256(bytes),
    ...overrides,
  };
}

function request(body, authorization = 'Bearer user-jwt') {
  return new Request('https://example.supabase.co/functions/v1/submit-program', {
    method: 'POST',
    headers: {
      authorization,
      'content-type': 'application/json',
      origin: 'https://mamingsuper.github.io',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function deps(overrides = {}) {
  return {
    allowedOrigins: new Set(['https://mamingsuper.github.io']),
    authenticate: async () => ({ id: USER_ID }),
    inspectStorage: async (path) => ({
      path,
      name: 'program.pdf',
      size: pdfBytes().length,
      contentType: 'application/pdf',
      bytes: pdfBytes(),
    }),
    persist: async (values) => ({
      id: values.target_submission_id,
      status: 'submitted',
      submittedAt: '2026-08-23T12:00:00.000Z',
    }),
    randomUUID: () => SUBMISSION_ID,
    ...overrides,
  };
}

test('submit boundary requires verified JWT owner and rejects body owner fields', async () => {
  let persisted = 0;
  const options = deps({ persist: async () => { persisted += 1; throw new Error('unexpected'); } });
  assert.equal((await handleSubmitProgramRequest(request(urlInput(), ''), options)).status, 401);
  assert.equal((await handleSubmitProgramRequest(request(urlInput({ userId: USER_ID })), options)).status, 400);
  assert.equal((await handleSubmitProgramRequest(request(urlInput({ user_id: USER_ID })), options)).status, 400);
  assert.equal(persisted, 0);
});

test('URL submission never inspects or fetches the remote source and persists only verified owner data', async () => {
  const calls = [];
  const response = await handleSubmitProgramRequest(request(urlInput()), deps({
    authenticate: async (token) => {
      assert.equal(token, 'user-jwt');
      return { id: USER_ID };
    },
    inspectStorage: async () => { throw new Error('URL submissions must not inspect storage'); },
    persist: async (values) => {
      calls.push(values);
      return { id: SUBMISSION_ID, status: 'submitted', submittedAt: '2026-08-23T12:00:00.000Z' };
    },
  }));

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://mamingsuper.github.io');
  assert.deepEqual(await response.json(), {
    data: { submissionId: SUBMISSION_ID, status: 'submitted', submittedAt: '2026-08-23T12:00:00.000Z' },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target_user_id, USER_ID);
  assert.equal(calls[0].target_submission_kind, 'url');
  assert.equal(calls[0].target_program_url, 'https://program.icahdq.org/2026');
  assert.equal(Object.hasOwn(calls[0], 'userId'), false);
  assert.equal(Object.hasOwn(calls[0], 'user_id'), false);
});

test('file path is owner/submission/safe-name and service metadata plus content hash must agree', async () => {
  const valid = await fileInput();
  const calls = [];
  const response = await handleSubmitProgramRequest(request(valid), deps({ persist: async (values) => {
    calls.push(values);
    return { id: SUBMISSION_ID, status: 'submitted', submittedAt: '2026-08-23T12:00:00.000Z' };
  } }));
  assert.equal(response.status, 201);
  assert.equal(calls[0].target_submission_id, SUBMISSION_ID);
  assert.equal(calls[0].target_storage_path, `${USER_ID}/${SUBMISSION_ID}/program.pdf`);
  assert.equal(calls[0].target_content_sha256, valid.sha256);

  const badOwner = await fileInput({ storagePath: `33333333-3333-4333-8333-333333333333/${SUBMISSION_ID}/program.pdf` });
  assert.equal((await handleSubmitProgramRequest(request(badOwner), deps())).status, 400);

  for (const inspectStorage of [
    async () => ({ name: 'program.pdf', size: pdfBytes().length + 1, contentType: 'application/pdf', bytes: pdfBytes() }),
    async () => ({ name: 'program.pdf', size: pdfBytes().length, contentType: 'application/zip', bytes: pdfBytes() }),
    async () => ({ name: 'program.pdf', size: pdfBytes().length, contentType: 'application/pdf', bytes: encoder.encode('%PDF-different') }),
    async () => null,
  ]) {
    const blocked = await handleSubmitProgramRequest(request(valid), deps({ inspectStorage }));
    assert.equal(blocked.status, 400);
  }
});

test('duplicate source is a safe 409 and internal persistence errors are closed', async () => {
  const duplicate = await handleSubmitProgramRequest(request(urlInput()), deps({
    persist: async () => { throw Object.assign(new Error('db detail must stay private'), { code: '23505' }); },
  }));
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), {
    error: { code: 'DUPLICATE_SUBMISSION', message: 'This conference program has already been submitted.' },
  });

  const unavailable = await handleSubmitProgramRequest(request(urlInput()), deps({
    persist: async () => { throw new Error('secret database detail'); },
  }));
  assert.equal(unavailable.status, 503);
  assert.equal(JSON.stringify(await unavailable.json()).includes('secret database detail'), false);
});

test('endpoint source uses Auth, service Storage info/download, and one atomic RPC without URL fetch', async () => {
  const source = await readFile(
    new URL('../supabase/functions/submit-program/index.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /getUser/i);
  assert.match(source, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /\.storage[\s\S]*\.info\(/i);
  assert.match(source, /\.download\(/i);
  assert.match(source, /create_program_submission/i);
  assert.match(source, /rightsAttested/i);
  assert.match(source, /no-store/i);
  assert.doesNotMatch(source, /fetch\s*\([^\n]*(?:programUrl|program_url)/i);
  assert.doesNotMatch(source, /body\.(?:userId|user_id)/i);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)/i);
});
