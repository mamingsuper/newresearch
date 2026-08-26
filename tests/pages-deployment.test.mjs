import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { promisify } from 'node:util';

const root = new URL('../', import.meta.url);
const execFileAsync = promisify(execFile);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

function buildEnv(publishableKey) {
  return {
    ...process.env,
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  };
}

test('public runtime config contains only the public Edge API base URL', async () => {
  const config = await text('public/config.js');

  assert.match(config, /window\.__IDEA_RADAR_CONFIG__/);
  assert.match(config, /https:\/\/euptkcjwunpnwiqejtru\.supabase\.co\/functions\/v1/);
  assert.doesNotMatch(config, /OPENAI_API_KEY|SUPABASE_(?:SECRET|SERVICE_ROLE)|RATE_LIMIT_HMAC_KEY|sb_secret_|service_role/i);
});

test('Pages builder emits a subpath-safe static artifact and scans for secrets', async () => {
  const [builder, packageSource] = await Promise.all([
    text('scripts/build-pages.mjs'),
    text('package.json'),
  ]);
  const pkg = JSON.parse(packageSource);

  assert.equal(pkg.scripts['pages:build'], 'npm run browser:vendor && npm run frontend:build && node scripts/build-pages.mjs');
  assert.match(builder, /pages-dist/);
  assert.match(builder, /frontendDist/);
  assert.match(builder, /\.nojekyll/);
  assert.match(builder, /root-absolute|absolute asset|href=|src=/i);
  assert.match(builder, /OPENAI_API_KEY|sb_secret_|SERVICE_ROLE|RATE_LIMIT_HMAC_KEY/i);
});

test('Pages builder reports the actual artifact file count', async () => {
  await execFileAsync('npm', ['run', 'frontend:build'], { cwd: root });
  const { stdout } = await execFileAsync(process.execPath, ['scripts/build-pages.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: buildEnv('sb_publishable_test'),
  });
  const result = JSON.parse(stdout.trim());
  const output = new URL('../pages-dist/', import.meta.url);
  const walk = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => (
      entry.isDirectory() ? walk(new URL(`${entry.name}/`, directory)) : 1
    )));
    return nested.flat(Infinity).reduce((total, count) => total + count, 0);
  };

  assert.equal(result.files, await walk(output));

  const config = await text('pages-dist/config.js');
  const [indexHtml, fallbackHtml] = await Promise.all([
    text('pages-dist/index.html'),
    text('pages-dist/404.html'),
  ]);
  assert.match(config, /apiBaseUrl:\s*'https:\/\/euptkcjwunpnwiqejtru\.supabase\.co\/functions\/v1'/);
  assert.match(config, /supabaseUrl:\s*'https:\/\/euptkcjwunpnwiqejtru\.supabase\.co'/);
  assert.match(config, /supabasePublishableKey:\s*'sb_publishable_test'/);
  assert.doesNotMatch(config, /__PUBLIC_SUPABASE_PUBLISHABLE_KEY__/);
  assert.equal(fallbackHtml, indexHtml);
  assert.ok((await readdir(new URL('assets/', output))).some((name) => name.endsWith('.js')));
});

test('Pages builder rejects missing and secret-shaped credentials', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ['scripts/build-pages.mjs'], {
      cwd: root,
      env: buildEnv(''),
    }),
    /PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
  );
  await assert.rejects(
    execFileAsync(process.execPath, ['scripts/build-pages.mjs'], {
      cwd: root,
      env: buildEnv('sb_secret_test'),
    }),
    /PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
  );
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
  assert.match(workflow, /PUBLIC_SUPABASE_PUBLISHABLE_KEY:\s*\$\{\{\s*vars\.SUPABASE_PUBLISHABLE_KEY\s*\}\}/);
  assert.match(workflow, /npm run pages:budget/);
  assert.match(workflow, /actions\/configure-pages@v6/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /path:\s*pages-dist/i);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /environment:\s*[\s\S]*github-pages/i);
});
