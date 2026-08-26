import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/202608250001_super_research_jobs.sql', import.meta.url);

test('SUPER authorization is private, owner-scoped, idempotent, and quota bounded', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  for (const table of ['super_usage_monthly', 'analysis_jobs']) {
    assert.match(sql, new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+private\\.${table}`, 'i'));
    assert.match(sql, new RegExp(`alter\\s+table\\s+private\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'));
  }
  assert.match(sql, /unique\s*\(user_id,\s*client_request_id\)/i);
  assert.match(sql, /model_key\s+text[\s\S]*check\s*\(model_key\s+in\s*\('default',\s*'super_apodex'\)\)/i);
  assert.match(sql, /match_count\s+integer[\s\S]*check\s*\(match_count\s+in\s*\(10,\s*20,\s*100\)\)/i);
  assert.match(sql, /create or replace function public\.authorize_analysis_request/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /target_client_request_id/i);
  assert.match(sql, /super_used\s*>=\s*5/i);
  assert.match(sql, /'PRO_REQUIRED'/i);
  assert.match(sql, /'SUPER_LIMIT_REACHED'/i);
  assert.match(sql, /requested_match_count\s*:=\s*10/i);
  assert.match(sql, /requested_match_count\s+not\s+in\s*\(20,\s*100\)/i);
  assert.match(sql, /where\s+j\.user_id\s*=\s*target_user_id\s+and\s+j\.id\s*=\s*target_job_id/i);
  assert.match(sql, /revoke all on private\.super_usage_monthly, private\.analysis_jobs from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on private\.super_usage_monthly, private\.analysis_jobs to service_role/i);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i);
});

test('billing status exposes both default and SUPER remaining allowances', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create(?: or replace)? function public\.get_analysis_entitlement_status/i);
  assert.match(sql, /super_remaining/i);
  assert.match(sql, /super_monthly_limit/i);
  assert.match(sql, /greatest\s*\(0,\s*5\s*-\s*coalesce/i);
  assert.match(sql, /timezone\('utc',\s*now\(\)\)::date/i);
  assert.match(sql, /date_trunc\('month',\s*timezone\('utc',\s*now\(\)\)\)/i);
});
