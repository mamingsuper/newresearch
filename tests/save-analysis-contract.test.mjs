import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleAuthenticatedJsonRequest } from '../supabase/functions/_shared/authenticated-request.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';

function report() {
  return {
    ideaProfile: { summary: 'A bounded summary', topics: ['trust'], population: null, method: null, mechanisms: [] },
    coverageNotice: 'Conference corpus only.',
    closestWork: [],
    relatedPapers: [],
    innovationPaths: [],
    recommendedNextSteps: ['Search journals next.'],
    limitations: ['Conference coverage is incomplete.'],
  };
}

function input(overrides = {}) {
  return {
    clientRequestId: REQUEST_ID,
    title: 'Trust and AI',
    ideaText: 'How does transparent generative AI affect political trust?',
    report: report(),
    language: 'en',
    corpusSnapshot: { ready: true, paperCount: 8906, conferences: [{ slug: 'apsa', year: 2026, papers: 5493 }] },
    ...overrides,
  };
}

function request(body, { authorization = 'Bearer user-jwt' } = {}) {
  return new Request('https://example.supabase.co/functions/v1/save-analysis', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json', origin: 'https://mamingsuper.github.io' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function deps(overrides = {}) {
  return {
    allowedOrigins: new Set(['https://mamingsuper.github.io']),
    authenticate: async () => ({ id: USER_ID }),
    persist: async () => SESSION_ID,
    now: () => new Date('2026-08-23T12:00:00.000Z'),
    ...overrides,
  };
}

test('save boundary rejects missing auth, oversized bodies, and body user identifiers before persistence', async () => {
  let persisted = 0;
  const options = deps({ persist: async () => { persisted += 1; return SESSION_ID; } });

  const unauthorized = await handleAuthenticatedJsonRequest(request(input(), { authorization: '' }), options);
  assert.equal(unauthorized.status, 401);

  const oversized = await handleAuthenticatedJsonRequest(request('x'.repeat(256 * 1024 + 1)), options);
  assert.equal(oversized.status, 413);

  for (const forged of [input({ userId: SESSION_ID }), input({ user_id: SESSION_ID })]) {
    const response = await handleAuthenticatedJsonRequest(request(forged), options);
    assert.equal(response.status, 400);
  }
  assert.equal(persisted, 0);
});
test('save boundary maps only the verified owner to the canonical service persistence call', async () => {
  const calls = [];
  const response = await handleAuthenticatedJsonRequest(request(input()), deps({
    authenticate: async (token) => {
      assert.equal(token, 'user-jwt');
      return { id: USER_ID };
    },
    persist: async (values) => { calls.push(values); return SESSION_ID; },
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://mamingsuper.github.io');
  assert.deepEqual(await response.json(), { data: { sessionId: SESSION_ID, createdAt: '2026-08-23T12:00:00.000Z' } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target_user_id, USER_ID);
  assert.equal(calls[0].client_request_id, REQUEST_ID);
  assert.equal(Object.hasOwn(calls[0], 'userId'), false);
  assert.equal(Object.hasOwn(calls[0], 'user_id'), false);
});

test('save boundary rejects malformed canonical reports and unsafe corpus URLs with closed errors', async () => {
  for (const bad of [
    input({ report: { ...report(), relatedPapers: Array(21).fill({}) } }),
    input({ report: { ...report(), limitations: [] } }),
    input({ report: { ...report(), relatedPapers: [{ paperId: REQUEST_ID, sourceUrl: 'javascript:alert(1)' }] } }),
    input({ clientRequestId: 'not-a-uuid' }),
  ]) {
    const response = await handleAuthenticatedJsonRequest(request(bad), deps());
    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys((await response.json()).error).sort(), ['code', 'message']);
  }
});

test('Edge entrypoint uses user-scoped Auth and service-only RPC without accepting a body owner', async () => {
  const [edge, shared] = await Promise.all([
    readFile(new URL('../supabase/functions/save-analysis/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/_shared/authenticated-request.ts', import.meta.url), 'utf8'),
  ]);
  const source = `${shared}\n${edge}`;
  assert.match(source, /authorization/i);
  assert.match(source, /256\s*\*\s*1024/);
  assert.match(source, /getUser/i);
  assert.match(source, /save_analysis_session/);
  assert.match(source, /target_user_id:\s*user\.id/i);
  assert.match(source, /cache-control['"]?\s*[:,]\s*['"]no-store/i);
  assert.doesNotMatch(source, /body\.(?:userId|user_id)/i);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)/i);
});
