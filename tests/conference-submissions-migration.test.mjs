import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../supabase/migrations/202608230005_conference_submissions.sql',
  import.meta.url,
);

async function migrationSql() {
  return readFile(migrationUrl, 'utf8');
}

test('submission migration separates public catalog, private review, and production import', async () => {
  const sql = await migrationSql();

  assert.match(sql, /create table if not exists public\.program_submissions/i);
  assert.match(sql, /create table if not exists public\.conference_programs/i);
  assert.match(sql, /create table if not exists workspace_private\.submission_events/i);
  assert.match(sql, /create table if not exists workspace_private\.program_import_previews/i);
  assert.match(sql, /create table if not exists workspace_private\.program_import_records/i);
  assert.match(sql, /submission_kind[\s\S]*in \('url', 'file'\)/i);
  assert.match(sql, /status[\s\S]*'submitted'[\s\S]*'imported'[\s\S]*'rejected'/i);
  assert.match(sql, /alter table public\.program_submissions enable row level security/i);
  assert.match(sql, /\(select auth\.uid\(\)\) is not null[\s\S]*\(select auth\.uid\(\)\) = user_id/i);
  assert.match(sql, /auth\.jwt\(\)[\s\S]*app_metadata[\s\S]*admin/i);
  assert.equal(
    sql.match(/app_metadata' ->> 'role'\) is distinct from 'admin'/gi)?.length,
    2,
    'both privileged definer helpers must reject a missing role claim',
  );
  assert.match(sql, /confirm_program_import/i);
  assert.match(sql, /insert into public\.embedding_jobs/i);
  assert.match(sql, /program-submissions/i);
});

test('submission metadata, source, upload, and lifecycle constraints are bounded', async () => {
  const sql = await migrationSql();

  assert.match(sql, /conference_year[\s\S]*between 1900 and 2100/i);
  assert.match(sql, /rights_attested[\s\S]*rights_attested = true/i);
  assert.match(sql, /file_size_bytes[\s\S]*26214400/i);
  assert.match(sql, /mime_type[\s\S]*application\/pdf[\s\S]*text\/csv[\s\S]*application\/json[\s\S]*application\/zip/i);
  assert.match(sql, /content_sha256[\s\S]*\^\[0-9a-f\]\{64\}\$/i);
  assert.match(sql, /submission_kind = 'url'[\s\S]*program_url is not null[\s\S]*storage_path is null/i);
  assert.match(sql, /submission_kind = 'file'[\s\S]*program_url is null[\s\S]*storage_path is not null/i);
  assert.match(sql, /user_id uuid references auth\.users\s*\(id\) on delete set null/i);
  assert.match(sql, /actor_user_id uuid references auth\.users\s*\(id\) on delete set null/i);
  assert.match(sql, /raw_hash is not null and raw_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
  assert.match(sql, /embedding_input_hash is not null and embedding_input_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
});

test('RLS exposes only owner submissions, admin queue, and published programs', async () => {
  const sql = await migrationSql();

  assert.match(sql, /create policy "program submissions owner select"[\s\S]*for select[\s\S]*to authenticated[\s\S]*auth\.uid/i);
  assert.match(sql, /create policy "program submissions admin select"[\s\S]*for select[\s\S]*app_metadata[\s\S]*admin/i);
  assert.doesNotMatch(sql, /create policy "program submissions owner (?:insert|update|delete)"/i);
  assert.match(sql, /create policy "published conference programs select"[\s\S]*to anon, authenticated[\s\S]*published_at is not null/i);
  assert.match(sql, /revoke all on table workspace_private\.submission_events from public, anon, authenticated/i);
  assert.match(sql, /grant all on table workspace_private\.submission_events to service_role/i);
});

test('private storage accepts only bounded owner paths and locks submitted objects', async () => {
  const sql = await migrationSql();
  const storagePolicies = sql.slice(
    sql.indexOf('insert into storage.buckets'),
    sql.indexOf('create or replace function workspace_private.transition_program_submission_impl'),
  );

  assert.match(sql, /insert into storage\.buckets[\s\S]*'program-submissions'[\s\S]*false[\s\S]*26214400/i);
  assert.match(sql, /create policy "program submissions owner upload"[\s\S]*on storage\.objects for insert[\s\S]*storage\.foldername\(name\)[\s\S]*auth\.uid/i);
  assert.match(sql, /create policy "program submissions owner read pending upload"[\s\S]*not exists[\s\S]*public\.program_submissions/i);
  assert.match(sql, /create policy "program submissions owner delete pending upload"[\s\S]*not exists[\s\S]*public\.program_submissions/i);
  assert.doesNotMatch(storagePolicies, /create policy "[^"]*admin[^"]*"/i);
});

test('ordinary approval cannot write production papers', async () => {
  const sql = await migrationSql();
  const transitionBody = sql.match(
    /create or replace function public\.transition_program_submission[\s\S]*?\$\$;/i,
  )?.[0] ?? '';

  assert.doesNotMatch(transitionBody, /insert into public\.papers|update public\.papers/i);
});

test('final confirmation is admin-only, preview-gated, atomic, and idempotent', async () => {
  const sql = await migrationSql();
  const confirmation = sql.match(
    /create or replace function workspace_private\.confirm_program_import_impl[\s\S]*?\$\$;/i,
  )?.[0] ?? '';

  assert.match(confirmation, /app_metadata[\s\S]*admin/i);
  assert.match(confirmation, /role'\) is distinct from 'admin'/i);
  assert.match(confirmation, /for update/i);
  assert.match(confirmation, /status <> 'import_preview'/i);
  assert.match(confirmation, /preview_status <> 'valid'/i);
  assert.match(confirmation, /if preview_row\.record_count > 0 then[\s\S]*insert into public\.papers/i);
  assert.match(confirmation, /on conflict \(conference_slug, conference_year, source_record_id\) do update/i);
  assert.match(confirmation, /insert into public\.embedding_jobs[\s\S]*on conflict \(paper_id\) do update/i);
  assert.match(confirmation, /coverage_status/i);
  assert.match(confirmation, /program_only/i);
  assert.match(confirmation, /indexed/i);
  assert.match(confirmation, /insert into workspace_private\.submission_events/i);
});
