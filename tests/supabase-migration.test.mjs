import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../supabase/migrations/202608210001_initial_schema.sql',
  import.meta.url,
);

test('migration defines provenance, vector search, full-text search, and RRF', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create extension if not exists vector/i);
  assert.match(sql, /create table if not exists public\.conference_sources/i);
  assert.match(sql, /create table if not exists public\.crawl_runs/i);
  assert.match(sql, /create table if not exists public\.papers/i);
  assert.match(sql, /source_url\s+text\s+not null/i);
  assert.match(sql, /raw_hash\s+text\s+not null/i);
  assert.match(sql, /embedding\s+extensions\.vector\(512\)/i);
  assert.match(sql, /using gin\s*\(search_document\)/i);
  assert.match(sql, /using hnsw\s*\(embedding vector_cosine_ops\)/i);
  assert.match(sql, /create or replace function public\.hybrid_search_papers/i);
  assert.match(sql, /rrf_k/i);
  assert.match(sql, /alter table public\.conference_sources enable row level security/i);
  assert.match(sql, /alter table public\.crawl_runs enable row level security/i);
  assert.match(sql, /alter table public\.papers enable row level security/i);
  assert.match(sql, /revoke all on table public\.papers from anon, authenticated/i);
  assert.match(sql, /grant all on table public\.papers to service_role/i);
});
