#!/usr/bin/env node
import { processEmbeddingBatch } from '../src/corpus/embedding-worker.mjs';
import { OpenAIEmbeddingsClient } from '../src/retrieval/supabase-retriever.mjs';
import { SupabaseCorpusClient } from '../src/supabase/corpus-client.mjs';

const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
try {
  if (!process.env.SUPABASE_URL || !key || !process.env.OPENAI_API_KEY) {
    const error = new Error('Supabase and OpenAI credentials required');
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }
  const store = new SupabaseCorpusClient({ url: process.env.SUPABASE_URL, apiKey: key });
  const embeddingClient = new OpenAIEmbeddingsClient({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  });
  const untilEmpty = process.argv.includes('--until-empty');
  const total = { claimed: 0, completed: 0, retried: 0, failed: 0, stale: 0, batches: 0 };
  do {
    const result = await processEmbeddingBatch({
      store,
      embeddingClient,
      batchSize: Number.parseInt(process.env.EMBEDDING_BATCH_SIZE ?? '64', 10),
      leaseSeconds: Number.parseInt(process.env.EMBEDDING_LEASE_SECONDS ?? '300', 10),
      maxAttempts: Number.parseInt(process.env.EMBEDDING_MAX_ATTEMPTS ?? '5', 10),
    });
    for (const field of ['claimed', 'completed', 'retried', 'failed', 'stale']) total[field] += result[field];
    total.batches += 1;
    console.log(JSON.stringify({ command: 'corpus:embed:batch', ...result, batches: total.batches }));
    if (result.claimed === 0 || !untilEmpty) break;
  } while (true);
  console.log(JSON.stringify({ command: 'corpus:embed', provider: 'openai', model: embeddingClient.model, ...total }));
} catch (error) {
  console.error(JSON.stringify({ command: 'corpus:embed', errorCode: error?.code ?? 'EMBED_FAILED' }));
  process.exitCode = error?.code === 'SERVICE_NOT_CONFIGURED' ? 3 : 4;
}
