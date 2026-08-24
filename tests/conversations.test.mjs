import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createConversationStore, renderConversationList } from '../public/conversations.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';

const saveInput = {
  title: 'Trust and AI',
  ideaText: 'How does transparent generative AI affect political trust?',
  report: { ideaProfile: { summary: 'Trust and AI' }, relatedPapers: [] },
  language: 'en',
  corpusSnapshot: { ready: true, paperCount: 8906, conferences: [] },
};

function queryFake() {
  const calls = [];
  const sessionRows = [{ id: SESSION_ID, user_id: USER_ID, title: 'Trust and AI', idea_text: saveInput.ideaText, report: saveInput.report, language: 'en', corpus_snapshot: {}, created_at: '2026-08-23', updated_at: '2026-08-23' }];
  const messageRows = [
    { session_id: SESSION_ID, user_id: USER_ID, sequence_no: 2, role: 'assistant', content: saveInput.report },
    { session_id: SESSION_ID, user_id: USER_ID, sequence_no: 1, role: 'user', content: saveInput.ideaText },
  ];
  function builder(call, rows) {
    return {
      select(columns) { call.select = columns; return this; },
      update(value) { call.method = 'update'; call.value = value; return this; },
      delete() { call.method = 'delete'; return this; },
      eq(column, value) { call.filters.push([column, value]); return this; },
      order(column, options) { call.order = [column, options]; return this; },
      then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
    };
  }
  return {
    calls,
    client: {
      from(table) {
        const call = { table, method: 'select', filters: [] };
        calls.push(call);
        return builder(call, table === 'analysis_messages' ? messageRows : sessionRows);
      },
    },
  };
}

test('explicit save retries reuse one request UUID and the next completed intent gets a new UUID', async () => {
  const bodies = [];
  let attempt = 0;
  const ids = [REQUEST_ID, SECOND_REQUEST_ID];
  const store = createConversationStore({
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      attempt += 1;
      if (attempt === 1) return new Response(JSON.stringify({ error: {} }), { status: 503 });
      return new Response(JSON.stringify({ data: { sessionId: SESSION_ID, createdAt: '2026-08-23' } }), { status: 200 });
    },
    endpoint: '/functions/v1/save-analysis',
    getAccessToken: async () => 'user-jwt',
    randomUUID: () => ids.shift(),
    supabase: queryFake().client,
    getUserId: () => USER_ID,
  });

  await assert.rejects(() => store.save(saveInput), { code: 'conversations_unavailable' });
  await store.save(saveInput);
  await store.save(saveInput);
  assert.deepEqual(bodies.map((body) => body.clientRequestId), [REQUEST_ID, REQUEST_ID, SECOND_REQUEST_ID]);
  assert.ok(bodies.every((body) => !Object.hasOwn(body, 'userId') && !Object.hasOwn(body, 'user_id')));
});
test('conversation list, reopen, rename, and delete are owner-filtered and messages are sequence ordered', async () => {
  const fake = queryFake();
  const store = createConversationStore({
    fetchImpl: async () => new Response('{}', { status: 500 }), endpoint: '/save',
    getAccessToken: async () => 'token', randomUUID: () => REQUEST_ID,
    supabase: fake.client, getUserId: () => USER_ID,
  });

  const sessions = await store.list();
  const reopened = await store.reopen(SESSION_ID);
  await store.rename(SESSION_ID, 'Renamed analysis');
  await store.remove(SESSION_ID);

  assert.equal(sessions[0].id, SESSION_ID);
  assert.deepEqual(reopened.messages.map((message) => message.sequenceNo), [1, 2]);
  assert.deepEqual(reopened.report, saveInput.report);
  assert.ok(fake.calls.every((call) => call.filters.some(([column, value]) => column === 'user_id' && value === USER_ID)));
  assert.deepEqual(fake.calls.find((call) => call.table === 'analysis_messages').order, ['sequence_no', { ascending: true }]);
  assert.deepEqual(fake.calls.find((call) => call.method === 'update').value, { title: 'Renamed analysis' });
  assert.equal(JSON.stringify(fake.calls).includes('report:'), false);
});

test('renderer exposes explicit reopen, rename, export, and delete actions', () => {
  const root = { ownerDocument: null, replaceChildren(...children) { this.children = children; } };
  const output = renderConversationList({ root, sessions: [{ id: SESSION_ID, title: 'Trust and AI', updatedAt: '2026-08-23', language: 'en' }], t: (key) => key });
  assert.equal(output.visibleCount, 1);
  assert.deepEqual(output.view[0].actions, ['reopen', 'rename', 'export', 'delete']);
});

test('application persists only from an explicit Save control and can reopen without analysis', async () => {
  const [app, html, i18n] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/i18n.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="save-analysis-button"[^>]*hidden/);
  assert.match(html, /id="conversations"[^>]*hidden/);
  assert.match(app, /saveAnalysisButton\.addEventListener\(['"]click/);
  assert.doesNotMatch(app.match(/function renderReport[\s\S]*?\n\}/)?.[0] ?? '', /\.save\(/);
  assert.match(app, /conversationStore\.reopen/);
  assert.match(app, /renderReport\(session\.report/);
  for (const key of ['conversation.save', 'conversation.saved', 'conversation.title', 'conversation.delete']) {
    assert.equal((i18n.match(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g')) ?? []).length, 2);
  }
});
