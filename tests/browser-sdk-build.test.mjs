import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const root = new URL('../', import.meta.url);
const execFileAsync = promisify(execFile);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('browser SDK is pinned, local, and generated before public builds', async () => {
  const pkg = JSON.parse(await text('package.json'));
  assert.equal(pkg.dependencies['@supabase/supabase-js'], '2.112.3');
  assert.equal(pkg.scripts['browser:vendor'], 'node scripts/prepare-browser-vendor.mjs');
  for (const script of ['dev', 'test', 'build', 'pages:build']) {
    assert.match(pkg.scripts[script], /^npm run browser:vendor && /);
  }

  const html = await text('public/index.html');
  assert.match(html, /\.\/vendor\/supabase-2\.112\.3\.js/);
  assert.doesNotMatch(html, /cdn\.jsdelivr|unpkg|esm\.sh/);
});

test('vendor preparation copies the pinned package UMD bundle', async () => {
  await execFileAsync(process.execPath, ['scripts/prepare-browser-vendor.mjs'], { cwd: root });

  const [installedPackage, source, generated] = await Promise.all([
    text('node_modules/@supabase/supabase-js/package.json').then(JSON.parse),
    readFile(new URL('../node_modules/@supabase/supabase-js/dist/umd/supabase.js', import.meta.url)),
    readFile(new URL('../public/vendor/supabase-2.112.3.js', import.meta.url)),
  ]);

  assert.equal(installedPackage.version, '2.112.3');
  assert.deepEqual(generated, source);
});

test('checked-in browser config disables Auth without disabling anonymous analysis', async () => {
  const config = await text('public/config.js');
  assert.match(config, /apiBaseUrl:\s*'https:\/\/euptkcjwunpnwiqejtru\.supabase\.co\/functions\/v1'/);
  assert.match(config, /supabaseUrl:\s*'https:\/\/euptkcjwunpnwiqejtru\.supabase\.co'/);
  assert.match(config, /supabasePublishableKey:\s*''/);
  assert.doesNotMatch(config, /sb_publishable_|sb_secret_|service_role/i);
});
