import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createOptimisticSavedPaperController,
  createSavedPaperStore,
  filterSavedPapers,
  renderSavedPaperLibrary,
} from '../public/saved-papers.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PAPER_ID = '22222222-2222-4222-8222-222222222222';

function postgrestFake({ fail = false, rpcData = [] } = {}) {
  const calls = [];
  function result() { return Promise.resolve(fail ? { error: { message: 'private database detail' } } : { data: null, error: null }); }
  const client = {
    rpc(name) {
      calls.push({ method: 'rpc', name });
      return Promise.resolve(fail ? { error: { message: 'private rpc detail' } } : { data: rpcData, error: null });
    },
    from(table) {
      const call = { method: '', table, filters: [] };
      calls.push(call);
      return {
        upsert(value, options) { Object.assign(call, { method: 'upsert', value, options }); return result(); },
        delete() {
          call.method = 'delete';
          return { eq(column, value) { call.filters.push([column, value]); return this; }, then(resolve, reject) { return result().then(resolve, reject); } };
        },
        update(value) {
          Object.assign(call, { method: 'update', value });
          return { eq(column, item) { call.filters.push([column, item]); return this; }, then(resolve, reject) { return result().then(resolve, reject); } };
        },
      };
    },
  };
  return { client, calls };
}

test('store derives owner, uses the allowlisted RPC, and upserts only relationship fields', async () => {
  const fake = postgrestFake({ rpcData: [{ paper_id: PAPER_ID, title: 'Canonical', embedding: [1] }] });
  const store = createSavedPaperStore({ supabase: fake.client, getUserId: () => USER_ID });

  const items = await store.list();
  await store.save(PAPER_ID);

  assert.equal(fake.calls[0].name, 'get_my_saved_papers');
  assert.deepEqual(items, [{
    paperId: PAPER_ID, note: '', tags: [], title: 'Canonical', authors: [], abstract: '',
    conferenceName: '', conferenceYear: null, division: '', keywords: [], sourceUrl: '',
  }]);
  assert.deepEqual(fake.calls[1], {
    method: 'upsert', table: 'saved_papers', filters: [],
    value: { user_id: USER_ID, paper_id: PAPER_ID },
    options: { onConflict: 'user_id,paper_id', ignoreDuplicates: true },
  });
  assert.equal(JSON.stringify(fake.calls).includes('embedding'), false);
});

test('remove and note updates always filter by owner and paper and enforce bounds', async () => {
  const fake = postgrestFake();
  const store = createSavedPaperStore({ supabase: fake.client, getUserId: () => USER_ID });
  await store.remove(PAPER_ID);
  await store.updateNote(PAPER_ID, { note: 'Read next', tags: ['methods', 'causal'] });

  assert.deepEqual(fake.calls[0].filters, [['user_id', USER_ID], ['paper_id', PAPER_ID]]);
  assert.deepEqual(fake.calls[1].filters, [['user_id', USER_ID], ['paper_id', PAPER_ID]]);
  assert.deepEqual(fake.calls[1].value, { note: 'Read next', tags: ['methods', 'causal'] });
  await assert.rejects(() => store.save('not-a-uuid'), { code: 'saved_papers_invalid_paper' });
  await assert.rejects(() => store.updateNote(PAPER_ID, { note: 'x'.repeat(4001), tags: [] }), { code: 'saved_papers_invalid_note' });
  await assert.rejects(() => store.updateNote(PAPER_ID, { note: '', tags: Array(21).fill('tag') }), { code: 'saved_papers_invalid_tags' });
  assert.equal(fake.calls.length, 2);
});

test('disabled and anonymous stores fail closed before contacting Supabase', async () => {
  const fake = postgrestFake();
  for (const store of [
    createSavedPaperStore({ supabase: null, getUserId: () => USER_ID }),
    createSavedPaperStore({ supabase: fake.client, getUserId: () => null }),
  ]) {
    await assert.rejects(() => store.list(), { code: 'saved_papers_auth_required' });
    await assert.rejects(() => store.save(PAPER_ID), { code: 'saved_papers_auth_required' });
  }
  assert.equal(fake.calls.length, 0);
});

test('database failures surface one stable safe error', async () => {
  const fake = postgrestFake({ fail: true });
  const store = createSavedPaperStore({ supabase: fake.client, getUserId: () => USER_ID });
  await assert.rejects(() => store.list(), (error) => {
    assert.equal(error.code, 'saved_papers_unavailable');
    assert.equal(error.message.includes('private'), false);
    return true;
  });
});

test('optimistic saves suppress duplicates and roll back on failure', async () => {
  let release;
  let rejectSave;
  const pending = new Promise((resolve, reject) => { release = resolve; rejectSave = reject; });
  const snapshots = [];
  const errors = [];
  const controller = createOptimisticSavedPaperController({
    store: { save: () => pending, remove: async () => {} },
    onChange: (snapshot) => snapshots.push(snapshot),
    onError: (code) => errors.push(code),
  });

  const first = controller.save(PAPER_ID);
  const duplicate = await controller.save(PAPER_ID);
  assert.equal(duplicate, false);
  assert.equal(controller.isSaved(PAPER_ID), true);
  assert.equal(controller.isPending(PAPER_ID), true);
  rejectSave(Object.assign(new Error('private'), { code: 'saved_papers_unavailable' }));
  assert.equal(await first, false);
  assert.equal(controller.isSaved(PAPER_ID), false);
  assert.equal(controller.isPending(PAPER_ID), false);
  assert.deepEqual(errors, ['saved_papers_unavailable']);
  assert.ok(snapshots.length >= 2);
  void release;
});

test('optimistic removal confirms success and rolls back failed removals', async () => {
  let fail = false;
  const errors = [];
  const controller = createOptimisticSavedPaperController({
    store: {
      async save() {},
      async remove() { if (fail) throw Object.assign(new Error('private'), { code: 'saved_papers_unavailable' }); },
    },
    onError: (code) => errors.push(code),
  });
  controller.replace([{ paperId: PAPER_ID }]);
  assert.equal(await controller.remove(PAPER_ID), true);
  assert.equal(controller.isSaved(PAPER_ID), false);
  controller.replace([{ paperId: PAPER_ID }]);
  fail = true;
  assert.equal(await controller.remove(PAPER_ID), false);
  assert.equal(controller.isSaved(PAPER_ID), true);
  assert.deepEqual(errors, ['saved_papers_unavailable']);
});

test('library filtering covers canonical fields and renderer keeps source links safe', () => {
  const items = [{
    paperId: PAPER_ID, title: 'Trust and AI', authors: [{ name: 'Jane Doe' }], abstract: 'Political communication',
    conferenceName: 'ICA', conferenceYear: 2026, division: 'Political Communication', keywords: ['trust'],
    note: 'Read closely', tags: ['core'], sourceUrl: 'https://example.org/program',
  }];
  assert.equal(filterSavedPapers(items, 'jane political core').length, 1);
  assert.equal(filterSavedPapers(items, 'unrelated').length, 0);

  const root = { ownerDocument: null, replaceChildren(...children) { this.children = children; } };
  const output = renderSavedPaperLibrary({ root, items, query: '', t: (key) => key });
  assert.equal(output.visibleCount, 1);
  const encoded = JSON.stringify(output.view);
  assert.match(encoded, /https:\/\/example\.org\/program/);
  assert.match(encoded, /noopener noreferrer/);

  const unsafe = renderSavedPaperLibrary({ root, items: [{ ...items[0], sourceUrl: 'javascript:alert(1)' }], t: (key) => key });
  assert.doesNotMatch(JSON.stringify(unsafe.view), /javascript:/);
  const missingYear = renderSavedPaperLibrary({ root, items: [{ ...items[0], conferenceYear: null }], t: (key) => key });
  assert.equal(missingYear.view[0].conferenceYear, null);
});

test('application wires authenticated intents to the private library without broad paper reads', async () => {
  const [app, html, i18n] = await Promise.all([
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/i18n.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="saved-papers"/);
  assert.match(html, /id="saved-papers-status"[^>]*aria-live="polite"/);
  assert.match(app, /createSavedPaperStore/);
  assert.match(app, /intent\.action === 'save-paper'/);
  assert.match(app, /intent\.action === 'saved-papers'/);
  assert.match(app, /savedPaperController\.save\(intent\.entityId\)/);
  assert.doesNotMatch(app, /from\(['"]papers['"]\)/);
  for (const key of ['saved.loading', 'saved.empty', 'saved.error.unavailable', 'saved.savedButton']) {
    assert.equal((i18n.match(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g')) ?? []).length, 2);
  }
});
