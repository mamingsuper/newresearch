import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../supabase/migrations/202608240001_fix_auth_profile_trigger.sql',
  import.meta.url,
);

test('OAuth profile trigger uses valid PostgreSQL conditional expressions', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create or replace function workspace_private\.handle_new_user\(\)/i);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
  assert.match(sql, /\bnullif\([\s\S]*\bcoalesce\(/i);
  assert.doesNotMatch(sql, /pg_catalog\.(?:nullif|coalesce)\s*\(/i);
  assert.match(sql, /insert into public\.profiles \(user_id, display_name, preferred_language\)/i);
  assert.match(sql, /revoke all on function workspace_private\.handle_new_user\(\) from public, anon, authenticated/i);
});
