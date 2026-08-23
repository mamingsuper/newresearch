import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../supabase/migrations/202608230001_nomic_embeddings.sql',
  import.meta.url,
);

test('migration retargets unfinished OpenAI embedding jobs to Nomic without changing vector dimensions', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /update\s+public\.embedding_jobs/i);
  assert.match(sql, /model\s*=\s*'nomic-ai\/nomic-embed-text-v1\.5'/i);
  assert.match(sql, /where[\s\S]*status\s+in\s*\(\s*'pending'\s*,\s*'processing'\s*\)/i);
  assert.match(sql, /dimensions\s*=\s*512/i);
  assert.match(sql, /attempts\s*=\s*0/i);
});
