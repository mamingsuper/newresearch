import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../supabase/migrations/202608230004_user_workspace.sql',
  import.meta.url,
);

async function migrationSql() {
  return readFile(migrationUrl, 'utf8');
}

test('workspace migration creates constrained user-owned tables and indexes', async () => {
  const sql = await migrationSql();

  for (const table of ['profiles', 'saved_papers', 'analysis_sessions', 'analysis_messages']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, 'i'));
  }

  assert.match(sql, /user_id uuid primary key references auth\.users\s*\(id\) on delete cascade/i);
  assert.match(sql, /primary key\s*\(user_id,\s*paper_id\)/i);
  assert.match(sql, /paper_id uuid not null references public\.papers\s*\(id\) on delete cascade/i);
  assert.match(sql, /session_id uuid not null references public\.analysis_sessions\s*\(id\) on delete cascade/i);
  assert.match(sql, /note[\s\S]*char_length\(note\) <= 4000/i);
  assert.match(sql, /tags[\s\S]*cardinality\(tags\) <= 20/i);
  assert.match(sql, /valid_saved_paper_tags\(tags\)/i);
  assert.match(sql, /char_length\(tag\) between 1 and 64/i);
  assert.match(sql, /title[\s\S]*char_length\(title\) between 1 and 200/i);
  assert.match(sql, /idea_text[\s\S]*char_length\(idea_text\) between 20 and 5000/i);
  assert.match(sql, /language[\s\S]*in \('en', 'zh'\)/i);
  assert.match(sql, /role[\s\S]*in \('user', 'assistant'\)/i);
  assert.match(sql, /octet_length\(report::text\) <= 65536/i);
  assert.match(sql, /octet_length\(corpus_snapshot::text\) <= 65536/i);
  assert.match(sql, /octet_length\(content::text\) <= 65536/i);

  assert.match(sql, /saved_papers_user_created_at_idx[\s\S]*\(user_id, created_at desc\)/i);
  assert.match(sql, /analysis_sessions_user_updated_at_idx[\s\S]*\(user_id, updated_at desc\)/i);
  assert.match(sql, /analysis_messages_session_created_at_idx[\s\S]*\(session_id, created_at\)/i);
  for (const table of ['profiles', 'saved_papers', 'analysis_sessions']) {
    assert.match(sql, new RegExp(`create trigger ${table}_set_updated_at`, 'i'));
  }
});

test('workspace grants and RLS policies enforce authenticated ownership', async () => {
  const sql = await migrationSql();

  assert.doesNotMatch(sql, /grant\s+[\s\S]*?\s+to anon\b/i);
  assert.match(sql, /grant select, update on table public\.profiles to authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.saved_papers to authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.analysis_sessions to authenticated/i);
  assert.match(sql, /grant select, insert on table public\.analysis_messages to authenticated/i);

  for (const table of ['profiles', 'saved_papers', 'analysis_sessions']) {
    assert.match(
      sql,
      new RegExp(
        `create policy "${table}[^\"]*select[^\"]*"[\\s\\S]*?on public\\.${table}[\\s\\S]*?for select[\\s\\S]*?to authenticated[\\s\\S]*?\\(select auth\\.uid\\(\\)\\) is not null[\\s\\S]*?\\(select auth\\.uid\\(\\)\\) = user_id`,
        'i',
      ),
    );
  }

  for (const table of ['profiles', 'saved_papers', 'analysis_sessions']) {
    assert.match(
      sql,
      new RegExp(
        `create policy "${table}[^\"]*update[^\"]*"[\\s\\S]*?on public\\.${table}[\\s\\S]*?for update[\\s\\S]*?to authenticated[\\s\\S]*?using \\([\\s\\S]*?auth\\.uid[\\s\\S]*?with check \\([\\s\\S]*?auth\\.uid`,
        'i',
      ),
    );
  }

  assert.match(
    sql,
    /create policy "analysis_messages owner select"[\s\S]*?to authenticated[\s\S]*?\(select auth\.uid\(\)\) is not null[\s\S]*?analysis_messages\.user_id[\s\S]*?exists[\s\S]*?public\.analysis_sessions[\s\S]*?analysis_sessions\.user_id = \(select auth\.uid\(\)\)/i,
  );
  assert.match(
    sql,
    /create policy "analysis_messages owner insert"[\s\S]*?to authenticated[\s\S]*?with check[\s\S]*?analysis_messages\.user_id[\s\S]*?exists[\s\S]*?public\.analysis_sessions/i,
  );
  assert.doesNotMatch(sql, /auth\.role\s*\(/i);
});

test('profile trigger is private, bounded, and cannot be called by browser roles', async () => {
  const sql = await migrationSql();

  assert.match(sql, /create or replace function private\.handle_new_user\(\)[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(sql, /left\([\s\S]*display_name[\s\S]*,\s*100\)/i);
  assert.match(sql, /preferred_language[\s\S]*in \('en', 'zh'\)/i);
  assert.match(sql, /create trigger on_auth_user_created[\s\S]*on auth\.users[\s\S]*private\.handle_new_user\(\)/i);
  assert.match(sql, /revoke all on function private\.handle_new_user\(\) from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /raw_user_meta_data[\s\S]*auth(?:orization|orize|role)/i);
});

test('workspace RPCs use private definer helpers and public invoker wrappers', async () => {
  const sql = await migrationSql();

  assert.match(sql, /create schema if not exists private/i);
  assert.doesNotMatch(sql, /create or replace function public\.[^(]+\([^$]*?security definer/i);

  for (const helper of ['get_my_saved_papers_impl', 'save_analysis_session_impl']) {
    assert.match(
      sql,
      new RegExp(`create or replace function private\\.${helper}[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`, 'i'),
    );
    assert.match(
      sql,
      new RegExp(`revoke all on function private\\.${helper}[\\s\\S]*?from public, anon, authenticated`, 'i'),
    );
  }

  for (const rpc of ['get_my_saved_papers', 'save_analysis_session']) {
    assert.match(
      sql,
      new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*?security invoker[\\s\\S]*?set search_path = ''`, 'i'),
    );
  }

  assert.match(sql, /if current_user_id is null then[\s\S]*raise sqlstate '28000'/i);
  assert.match(sql, /from public\.saved_papers[\s\S]*join public\.papers/i);
  assert.doesNotMatch(
    sql.match(/create or replace function private\.get_my_saved_papers_impl[\s\S]*?\$\$;/i)?.[0] ?? '',
    /embedding|raw_hash|search_document|embedding_input_hash/i,
  );
  assert.match(sql, /insert into public\.analysis_sessions/i);
  assert.match(sql, /insert into public\.analysis_messages/i);
  assert.match(sql, /grant execute on function public\.get_my_saved_papers\(\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.save_analysis_session\(text, text, jsonb, text, jsonb\) to authenticated/i);
  assert.match(sql, /revoke all on function public\.get_my_saved_papers\(\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.save_analysis_session\(text, text, jsonb, text, jsonb\) from public, anon, authenticated/i);
});
