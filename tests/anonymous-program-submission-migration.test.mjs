import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('anonymous URL submissions use a service-only transaction without collecting contact data', async () => {
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const name = (await readdir(directory)).find((file) => file.endsWith('_anonymous_program_submission.sql'));
  assert.ok(name, 'anonymous submission migration is missing');
  const sql = await readFile(new URL(name, directory), 'utf8');
  assert.match(sql, /create or replace function public\.create_anonymous_program_submission/i);
  assert.match(sql, /submission_kind[\s\S]*'url'/i);
  assert.match(sql, /revoke all on function public\.create_anonymous_program_submission[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.create_anonymous_program_submission[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /contact_email|target_contact_email|program_submission_contacts/i);
});
