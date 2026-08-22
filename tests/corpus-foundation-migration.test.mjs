import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const migrationPath = new URL('../supabase/migrations/202608220001_corpus_foundation.sql', import.meta.url);
test('corpus foundation migration defines protected ingestion and embedding job contracts', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  for (const table of ['ingestion_runs', 'ingestion_rejections', 'embedding_jobs']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, 'i'));
  }
  assert.match(sql, /embedding_dimensions integer[\s\S]*check \(embedding_dimensions = 512\)/i);
  assert.match(sql, /for update skip locked/i);
  for (const fn of ['claim_embedding_jobs', 'complete_embedding_job', 'release_embedding_job', 'get_corpus_stats']) {
    assert.match(sql, new RegExp(`function public\\.${fn}`, 'i'));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}`, 'i'));
  }
});
