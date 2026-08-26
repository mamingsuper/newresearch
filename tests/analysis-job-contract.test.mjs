import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const analyzeUrl = new URL('../supabase/functions/_shared/idea-radar.ts', import.meta.url);
const statusUrl = new URL('../supabase/functions/analysis-job-status/index.ts', import.meta.url);

test('SUPER submissions start one durable Apodex background job and return 202', async () => {
  const source = await readFile(analyzeUrl, 'utf8');

  assert.match(source, /createApodexResearch/);
  assert.match(source, /set_analysis_job_context/);
  assert.match(source, /set_analysis_job_provider/);
  assert.match(source, /super_apodex/);
  assert.match(source, /status:\s*['"]researching['"]/);
  assert.match(source, /},\s*202,\s*origin/);
});

test('job status verifies the owner, polls Apodex, stores completion, and never caches private output', async () => {
  const source = await readFile(statusUrl, 'utf8');

  assert.match(source, /authenticatedUserId/);
  assert.match(source, /get_analysis_job/);
  assert.match(source, /target_user_id:\s*userId/);
  assert.match(source, /pollApodexResearch/);
  assert.match(source, /complete_analysis_job/);
  assert.match(source, /fail_analysis_job/);
  assert.match(source, /reportMarkdown/);
  assert.match(source, /corpusSources/);
  assert.match(source, /webSources/);
  assert.match(source, /jsonResponse[\s\S]*['"]no-store['"]/i);
  assert.doesNotMatch(source, /console\.(log|error|warn)/);
  assert.doesNotMatch(source, /APODEX_API_KEY[^\n]*(?:Response|json|data)/i);
});
