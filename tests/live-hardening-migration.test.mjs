import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../supabase/migrations/202608220002_live_hardening.sql',
  import.meta.url,
);

test('live hardening migration indexes foreign keys and revokes public event-trigger execution', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /crawl_runs_conference_source_id_idx/i);
  assert.match(sql, /ingestion_rejections_ingestion_run_id_idx/i);
  assert.match(sql, /papers_conference_source_id_idx/i);
  assert.match(sql, /papers_last_ingestion_run_id_idx/i);
  assert.match(sql, /revoke execute on function public\.rls_auto_enable\(\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.rls_auto_enable\(\) to service_role/i);
});