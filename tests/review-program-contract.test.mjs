import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleReviewProgramRequest } from '../supabase/functions/review-program/index.ts';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SUBMISSION_ID = '22222222-2222-4222-8222-222222222222';

function input(overrides = {}) {
  return {
    submissionId: SUBMISSION_ID,
    expectedStatus: 'submitted',
    decision: 'start_review',
    reason: '',
    ...overrides,
  };
}

function request(body, authorization = 'Bearer admin-jwt') {
  return new Request('https://example.supabase.co/functions/v1/review-program', {
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
    authenticate: async () => ({ id: ADMIN_ID, appMetadata: { role: 'admin' } }),
    transition: async (_token, values) => ({
      id: values.submission_id,
      status: values.next_status,
      reviewedAt: '2026-08-23T13:00:00.000Z',
    }),
    ...overrides,
  };
}

test('review requires a fresh JWT admin claim and ignores user-controlled role data', async () => {
  let transitioned = 0;
  const transition = async () => { transitioned += 1; throw new Error('unexpected'); };

  assert.equal((await handleReviewProgramRequest(request(input(), ''), deps({ transition }))).status, 401);
  assert.equal((await handleReviewProgramRequest(request(input()), deps({
    authenticate: async () => ({ id: ADMIN_ID, appMetadata: {}, userMetadata: { role: 'admin' } }),
    transition,
  }))).status, 403);
  assert.equal((await handleReviewProgramRequest(request(input({ admin: true })), deps({ transition }))).status, 400);
  assert.equal((await handleReviewProgramRequest(request(input({ role: 'admin' })), deps({ transition }))).status, 400);
  assert.equal(transitioned, 0);
});

test('closed decision map passes expected status through the user JWT RPC context', async () => {
  const transitions = [];
  const cases = [
    [input(), 'under_review'],
    [input({ expectedStatus: 'under_review', decision: 'approve' }), 'approved'],
    [input({ expectedStatus: 'submitted', decision: 'reject', reason: 'Duplicate source.' }), 'rejected'],
    [input({ expectedStatus: 'under_review', decision: 'reject', reason: 'Rights could not be verified.' }), 'rejected'],
    [input({ expectedStatus: 'approved', decision: 'reject', reason: 'Unsafe redirect.' }), 'rejected'],
    [input({ expectedStatus: 'import_preview', decision: 'reject', reason: 'Preview validation failed.' }), 'rejected'],
  ];

  for (const [body, nextStatus] of cases) {
    const response = await handleReviewProgramRequest(request(body), deps({
      transition: async (token, values) => {
        transitions.push({ token, values });
        return { id: SUBMISSION_ID, status: nextStatus, reviewedAt: '2026-08-23T13:00:00.000Z' };
      },
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://mamingsuper.github.io');
    assert.equal((await response.json()).data.status, nextStatus);
  }

  assert.equal(transitions.length, cases.length);
  assert.equal(transitions[0].token, 'admin-jwt');
  assert.deepEqual(transitions[0].values, {
    submission_id: SUBMISSION_ID,
    expected_status: 'submitted',
    next_status: 'under_review',
    reason: null,
  });
});

test('invalid status/decision combinations and blank rejection reasons fail before RPC', async () => {
  let transitioned = 0;
  const options = deps({ transition: async () => { transitioned += 1; throw new Error('unexpected'); } });
  const invalid = [
    input({ expectedStatus: 'under_review', decision: 'start_review' }),
    input({ expectedStatus: 'submitted', decision: 'approve' }),
    input({ expectedStatus: 'approved', decision: 'approve' }),
    input({ expectedStatus: 'imported', decision: 'reject', reason: 'No.' }),
    input({ expectedStatus: 'rejected', decision: 'start_review' }),
    input({ expectedStatus: 'submitted', decision: 'unknown' }),
    input({ expectedStatus: 'submitted', decision: 'reject', reason: '' }),
    input({ expectedStatus: 'submitted', decision: 'reject', reason: '   ' }),
  ];
  for (const body of invalid) {
    assert.equal((await handleReviewProgramRequest(request(body), options)).status, 400);
  }
  assert.equal(transitioned, 0);
});

test('expected-status races return safe 409 while unknown rows and internal failures stay closed', async () => {
  const conflict = await handleReviewProgramRequest(request(input()), deps({
    transition: async () => { throw Object.assign(new Error('database detail'), { code: '40001' }); },
  }));
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), {
    error: { code: 'SUBMISSION_CHANGED', message: 'This submission changed. Refresh the queue and try again.' },
  });

  const missing = await handleReviewProgramRequest(request(input()), deps({
    transition: async () => { throw Object.assign(new Error('database detail'), { code: 'P0002' }); },
  }));
  assert.equal(missing.status, 404);

  const unavailable = await handleReviewProgramRequest(request(input()), deps({
    transition: async () => { throw new Error('secret database detail'); },
  }));
  assert.equal(unavailable.status, 503);
  assert.equal(JSON.stringify(await unavailable.json()).includes('secret database detail'), false);
});

test('production entrypoint gets a fresh user and invokes transition RPC with that JWT only', async () => {
  const source = await readFile(
    new URL('../supabase/functions/review-program/index.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /getUser/i);
  assert.match(source, /app_metadata|appMetadata/);
  assert.match(source, /transition_program_submission/i);
  assert.match(source, /Authorization:\s*`Bearer \$\{token\}`/i);
  assert.match(source, /expected_status/i);
  assert.match(source, /no-store/i);
  assert.doesNotMatch(source, /user_metadata|userMetadata/);
  assert.doesNotMatch(source, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.doesNotMatch(source, /body\.(?:admin|role|userId|user_id)/i);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)/i);
});
