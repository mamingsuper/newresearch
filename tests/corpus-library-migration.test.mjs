import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('paper browsing remains service-role mediated and paginated', async () => {
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const name = (await readdir(directory)).find((file) => file.endsWith('_corpus_library_rpc.sql'));
  assert.ok(name, 'corpus library migration is missing');
  const sql = await readFile(new URL(name, directory), 'utf8');
  assert.match(sql, /create or replace function public\.browse_corpus_papers/i);
  assert.match(sql, /target_limit/i);
  assert.match(sql, /target_offset/i);
  assert.match(sql, /search_document\s*@@/i);
  assert.match(sql, /revoke all on function public\.browse_corpus_papers[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.browse_corpus_papers[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+(table\s+)?public\.papers\s+to\s+(anon|authenticated)/i);
});
