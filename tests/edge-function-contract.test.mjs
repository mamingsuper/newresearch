import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sharedUrl = new URL('../supabase/functions/_shared/idea-radar.ts', import.meta.url);
const analyzeUrl = new URL('../supabase/functions/analyze-idea/index.ts', import.meta.url);

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
  assert.match(source, /text-embedding-3-small/);
  assert.match(source, /dimensions\s*:\s*512/);
  assert.match(source, /match_count\s*:\s*12/);
  assert.match(source, /gpt-5-mini/);
  assert.match(source, /max_output_tokens\s*:\s*1800/);
  assert.match(source, /reasoning\s*:\s*\{\s*effort\s*:\s*['"]minimal['"]\s*\}/);
  assert.match(source, /store\s*:\s*false/);
  assert.match(source, /json_schema/);
  assert.match(source, /strict\s*:\s*true/);
  assert.match(source, /required:\s*\['paperId',\s*'relationship',\s*'overlapDimensions'\]/);
  assert.match(source, /maxItems\s*:\s*5/);
  assert.match(source, /maxItems\s*:\s*3/);
  assert.match(source, /Canonical title, conference, evidence excerpt, and source URL/i);
  assert.match(source, /allowedPaperIds/i);
  assert.match(source, /canonical|groundClosestWork/i);
  assert.match(source, /Cache-Control|cache-control/i);
  assert.match(source, /no-store/i);
  assert.match(source, /OPTIONS/);
  assert.match(source, /Access-Control-Allow-Origin/i);
  assert.doesNotMatch(source, /console\.(log|error|warn)\([^\n]*(idea|body|clientNetwork)/i);
  assert.doesNotMatch(source, /providerBody|responseBody/);
});
