import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('public runtime config contains only the public Edge API base URL', async () => {
  const config = await text('public/config.js');

  assert.match(config, /window\.__IDEA_RADAR_CONFIG__/);
  assert.match(config, /https:\/\/euptkcjwunpnwiqejtru\.supabase\.co\/functions\/v1/);
  assert.doesNotMatch(config, /OPENAI_API_KEY|SUPABASE_(?:SECRET|SERVICE_ROLE)|RATE_LIMIT_HMAC_KEY|sb_secret_|service_role/i);
});

test('Pages builder emits a subpath-safe static artifact and scans for secrets', async () => {
  const [builder, pkg] = await Promise.all([
    text('scripts/build-pages.mjs'),
    text('package.json'),
  ]);

  assert.match(pkg, /"pages:build"\s*:\s*"node scripts\/build-pages\.mjs"/);
  assert.match(builder, /pages-dist/);
  assert.match(builder, /public/);
  assert.match(builder, /\.nojekyll/);
  assert.match(builder, /root-absolute|absolute asset|href=|src=/i);
  assert.match(builder, /OPENAI_API_KEY|sb_secret_|SERVICE_ROLE|RATE_LIMIT_HMAC_KEY/i);
});

test('Pages workflow verifies and deploys the pages-dist artifact from main', async () => {
  const workflow = await text('.github/workflows/pages.yml');

  assert.match(workflow, /branches:\s*\[?['"]?main['"]?\]?/i);
  assert.match(workflow, /contents:\s*read/i);
  assert.match(workflow, /pages:\s*write/i);
  assert.match(workflow, /id-token:\s*write/i);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run pages:build/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /path:\s*pages-dist/i);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /environment:\s*[\s\S]*github-pages/i);
});
