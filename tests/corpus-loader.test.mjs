import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_PAPERS } from '../src/fixtures/sample-papers.mjs';
import { embeddingInputHash } from '../src/corpus/embedding-text.mjs';
import { loadCorpus } from '../src/corpus/loader.mjs';
function fakeStore(existing = new Map()) {
  const calls = { upserts: [], jobs: [], completed: [], failed: [] };
  return { calls, async startIngestionRun() { return { id: 'run-1' }; }, async getPaperState(paper) { return existing.get(`${paper.conference.slug}:${paper.conference.year}:${paper.sourceRecordId}`) ?? null; }, async upsertPaper(input) { calls.upserts.push(input); return { id: input.id }; }, async upsertEmbeddingJob(input) { calls.jobs.push(input); }, async completeIngestionRun(input) { calls.completed.push(input); }, async failIngestionRun(input) { calls.failed.push(input); } };
}
test('loader inserts a new paper and queues one Nomic embedding job', async () => {
  const store = fakeStore(); const result = await loadCorpus({ records: [SAMPLE_PAPERS[0]], store, sourceLabel: 'ICA reviewed', inputSha256: 'a'.repeat(64) });
  assert.deepEqual(result.counts, { total: 1, inserted: 1, updated: 0, unchanged: 0, rejected: 0, embeddingJobsCreated: 1 });
  assert.equal(store.calls.upserts.length, 1); assert.equal(store.calls.jobs.length, 1); assert.equal(store.calls.jobs[0].inputHash, embeddingInputHash(SAMPLE_PAPERS[0]));
  assert.equal(store.calls.jobs[0].model, 'nomic-ai/nomic-embed-text-v1.5');
  assert.equal(store.calls.jobs[0].dimensions, 512);
});
test('loader treats identical raw content as unchanged', async () => {
  const paper = SAMPLE_PAPERS[0]; const store = fakeStore(new Map([[`ica:2026:${paper.sourceRecordId}`, { id: paper.id, rawHash: paper.rawHash, embeddingInputHash: embeddingInputHash(paper) }]]));
  const result = await loadCorpus({ records: [paper], store, sourceLabel: 'ICA reviewed', inputSha256: 'b'.repeat(64) });
  assert.equal(result.counts.unchanged, 1); assert.equal(store.calls.upserts.length, 0); assert.equal(store.calls.jobs.length, 0);
});
test('metadata-only changes update the paper without re-embedding', async () => {
  const paper = { ...SAMPLE_PAPERS[0], sourceUrl: 'https://example.org/new-url', rawHash: 'new-raw-hash' };
  const store = fakeStore(new Map([[`ica:2026:${paper.sourceRecordId}`, { id: paper.id, rawHash: 'old-raw', embeddingInputHash: embeddingInputHash(paper) }]]));
  const result = await loadCorpus({ records: [paper], store, sourceLabel: 'ICA reviewed', inputSha256: 'c'.repeat(64) });
  assert.equal(result.counts.updated, 1); assert.equal(store.calls.upserts.length, 1); assert.equal(store.calls.jobs.length, 0); assert.equal(store.calls.upserts[0].clearEmbedding, false);
});
test('embedding-relevant changes clear stale vectors and reset one job', async () => {
  const paper = { ...SAMPLE_PAPERS[0], abstract: `${SAMPLE_PAPERS[0].abstract} New mechanism.`, rawHash: 'new-raw-hash' };
  const store = fakeStore(new Map([[`ica:2026:${paper.sourceRecordId}`, { id: paper.id, rawHash: 'old-raw', embeddingInputHash: 'old-input-hash' }]]));
  const result = await loadCorpus({ records: [paper], store, sourceLabel: 'ICA reviewed', inputSha256: 'd'.repeat(64) });
  assert.equal(result.counts.updated, 1); assert.equal(result.counts.embeddingJobsCreated, 1); assert.equal(store.calls.upserts[0].clearEmbedding, true); assert.equal(store.calls.jobs.length, 1);
});
test('loader records validation rejections in the same ingestion run', async () => {
  const store=fakeStore(); store.recordRejections=async(items)=>{ store.calls.rejections=items; };
  const rejections=[{sourceRecordId:'bad-1',reasonCode:'missing_abstract',safeDetail:'record[2]'}];
  const result=await loadCorpus({records:[SAMPLE_PAPERS[0]],rejections,store,sourceLabel:'ICA reviewed',inputSha256:'e'.repeat(64)});
  assert.equal(result.counts.total,2); assert.equal(result.counts.rejected,1); assert.equal(store.calls.rejections.length,1); assert.equal(store.calls.rejections[0].ingestionRunId,'run-1');
});
