import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sharedUrl = new URL('../supabase/functions/_shared/idea-radar.ts', import.meta.url);
const analyzeUrl = new URL('../supabase/functions/analyze-idea/index.ts', import.meta.url);
const corpusStatusUrl = new URL('../supabase/functions/corpus-status/index.ts', import.meta.url);

test('analyze-idea Edge Function enforces the public beta evidence contract', async () => {
  const [shared, analyze] = await Promise.all([
    readFile(sharedUrl, 'utf8'),
    readFile(analyzeUrl, 'utf8'),
  ]);
  const source = `${shared}\n${analyze}`;

  assert.match(source, /https:\/\/mamingsuper\.github\.io/);
  assert.match(source, /http:\/\/localhost:3000/);
  assert.match(source, /http:\/\/127\.0\.0\.1:3000/);
  assert.match(source, /32\s*\*\s*1024/);
  assert.match(source, /20/);
  assert.match(source, /5000/);
  assert.match(source, /HMAC/i);
  assert.match(source, /SHA-256/i);
  assert.match(source, /RATE_LIMIT_HMAC_KEY/);
  assert.match(source, /consume_beta_rate_limit/);
  assert.match(source, /authorize_analysis_request/);
  assert.match(source, /AUTH_REQUIRED/);
  assert.match(source, /DAILY_LIMIT_REACHED/);
  assert.match(source, /authorization, content-type/i);
  assert.match(source, /text-embedding-3-small/);
  assert.match(source, /dimensions\s*:\s*512/);
  assert.match(source, /match_count\s*:\s*matchCount/);
  assert.match(source, /\[5,\s*10,\s*20,\s*100\]/);
  assert.match(source, /relatedPapers/);
  assert.match(source, /authorYearLabel/);
  assert.match(source, /abstract:\s*String\(row\.abstract/);
  assert.match(source, /rank:\s*index\s*\+\s*1/);
  assert.match(source, /score:\s*Number\(row\.score/);
  assert.match(source, /authors/);
  assert.match(source, /evidenceReferences/);
  assert.match(source, /gpt-5-mini/);
  assert.match(source, /max_output_tokens\s*:\s*1800/);
  assert.match(source, /reasoning\s*:\s*\{\s*effort\s*:\s*effort\s*===\s*['"]high['"]\s*\?\s*['"]medium['"]\s*:\s*['"]minimal['"]\s*\}/);
  assert.match(source, /store\s*:\s*false/);
  assert.match(source, /json_schema/);
  assert.match(source, /strict\s*:\s*true/);
  assert.match(source, /required:\s*\['paperId',\s*'relationship',\s*'overlapDimensions'\]/);
  assert.match(source, /maxItems\s*:\s*5/);
  assert.match(source, /maxItems\s*:\s*3/);
  assert.match(source, /allowedPaperIds/i);
  assert.match(source, /canonical|groundClosestWork/i);
  assert.match(source, /Cache-Control|cache-control/i);
  assert.match(source, /no-store/i);
  assert.match(source, /OPTIONS/);
  assert.match(source, /Access-Control-Allow-Origin/i);
  assert.doesNotMatch(source, /console\.(log|error|warn)\([^\n]*(idea|body|clientNetwork)/i);
  assert.doesNotMatch(source, /providerBody|responseBody/);
});

test('corpus-status exposes only cacheable public corpus metadata', async () => {
  const [shared, status] = await Promise.all([
    readFile(sharedUrl, 'utf8'),
    readFile(corpusStatusUrl, 'utf8'),
  ]);
  const source = `${shared}\n${status}`;

  assert.match(source, /req\.method\s*===\s*['"]OPTIONS['"]/);
  assert.match(source, /req\.method\s*!==\s*['"]GET['"]/);
  assert.match(source, /getCorpusStats/);
  assert.match(source, /ready/);
  assert.match(source, /paperCount/);
  assert.match(source, /papersWithAbstract/);
  assert.match(source, /embeddedPaperCount/);
  assert.match(source, /pendingEmbeddingCount/);
  assert.match(source, /failedEmbeddingCount/);
  assert.match(source, /conferences/);
  assert.match(source, /public,\s*max-age=60/i);
  assert.match(source, /Access-Control-Allow-Origin/i);
  assert.doesNotMatch(status, /serviceRole|SUPABASE_SERVICE_ROLE_KEY|ingestion_rejections|last_error|raw_/i);
});
