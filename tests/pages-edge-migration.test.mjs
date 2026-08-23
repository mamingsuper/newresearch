import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/202608230002_pages_edge_beta.sql', import.meta.url);

test('Pages Edge beta migration restores the OpenAI contract and adds private atomic rate limiting', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /update\s+public\.embedding_jobs[\s\S]*model\s*=\s*'text-embedding-3-small'/i);
  assert.match(sql, /where\s+status\s+in\s*\(\s*'pending'\s*,\s*'processing'\s*\)/i);
  assert.doesNotMatch(sql, /where\s+status\s*=\s*'completed'/i);
  assert.match(sql, /create\s+schema\s+if\s+not\s+exists\s+private/i);
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+private\.beta_rate_limit_buckets/i);
  assert.match(sql, /window_kind[\s\S]*'minute'[\s\S]*'hour'/i);
  assert.match(sql, /primary\s+key\s*\(\s*client_hash\s*,\s*window_kind\s*,\s*window_started_at\s*\)/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /request_count\s*>=\s*5/i);
  assert.match(sql, /request_count\s*>=\s*30/i);
  assert.match(sql, /interval\s+'2 hours'/i);
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.consume_beta_rate_limit\s*\(\s*client_hash\s+text\s*\)/i);
  assert.match(sql, /returns\s+table\s*\(\s*allowed\s+boolean\s*,\s*retry_after_seconds\s+integer\s*\)/i);
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.consume_beta_rate_limit\(text\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.consume_beta_rate_limit\(text\)\s+to\s+service_role/i);
  assert.doesNotMatch(sql, /research_idea|raw_idea|idea_text/i);
});
