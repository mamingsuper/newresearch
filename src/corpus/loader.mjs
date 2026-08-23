import { validatePaperRecord } from '../domain/schema.mjs';
import { embeddingInputHash } from './embedding-text.mjs';

export async function loadCorpus({ records, rejections = [], store, sourceLabel, inputSha256, sourceAdapter = 'canonical' }) {
  if (!Array.isArray(records)) throw new TypeError('records must be an array');
  if (!store) throw new TypeError('store is required');
  if (!sourceLabel) throw new TypeError('sourceLabel is required');
  if (typeof inputSha256 !== 'string' || inputSha256.length !== 64) throw new TypeError('inputSha256 must be a SHA-256 hex string');

  if (!Array.isArray(rejections)) throw new TypeError('rejections must be an array');
  const counts = { total: records.length + rejections.length, inserted: 0, updated: 0, unchanged: 0, rejected: rejections.length, embeddingJobsCreated: 0 };
  const run = await store.startIngestionRun({ sourceAdapter, sourceLabel, inputSha256, totalRecords: counts.total });
  try {
    if (rejections.length > 0) {
      if (typeof store.recordRejections !== 'function') throw new TypeError('store.recordRejections is required when rejections exist');
      await store.recordRejections(rejections.map((item) => ({ ingestionRunId: run.id, ...item })));
    }
    for (const record of records) {
      const paper = validatePaperRecord(record);
      const nextInputHash = embeddingInputHash(paper);
      const existing = await store.getPaperState(paper);
      if (existing?.rawHash === paper.rawHash) {
        counts.unchanged += 1;
        continue;
      }

      const isNew = !existing;
      const needsEmbedding = isNew || existing.embeddingInputHash !== nextInputHash;
      const saved = await store.upsertPaper({
        ...paper,
        id: existing?.id ?? null,
        embeddingInputHash: nextInputHash,
        lastIngestionRunId: run.id,
        clearEmbedding: needsEmbedding && !isNew,
      });
      if (isNew) counts.inserted += 1;
      else counts.updated += 1;

      if (needsEmbedding) {
        await store.upsertEmbeddingJob({
          paperId: saved.id ?? existing?.id ?? paper.id,
          inputHash: nextInputHash,
          model: 'nomic-ai/nomic-embed-text-v1.5',
          dimensions: 512,
        });
        counts.embeddingJobsCreated += 1;
      }
    }
    await store.completeIngestionRun({ runId: run.id, counts });
    return { runId: run.id, counts };
  } catch (error) {
    await store.failIngestionRun({ runId: run.id, errorCode: error?.code ?? 'load_failed', counts });
    throw error;
  }
}
