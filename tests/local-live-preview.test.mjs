import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [app, html, styles, workspace] = await Promise.all([
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/workspace.js', import.meta.url), 'utf8'),
]);

test('localhost uses the configured live Edge API and keeps Auth available', () => {
  assert.match(app, /new Set\(\['mamingsuper\.github\.io', 'localhost', '127\.0\.0\.1'\]\)/);
  assert.match(app, /edgeApiHosts\.has\(window\.location\.hostname\)/);
});

test('desktop keeps a persistent rail and compact navigation collapses before labels overlap', () => {
  assert.match(html, /id="mobile-account-entry"/);
  assert.match(styles, /\.workspace-shell\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--sidebar-width\)\s+minmax\(0,\s*1fr\)/i);
  assert.match(styles, /@media \(max-width: 1199px\)/);
  assert.match(workspace, /matchMedia\?\.\('\(max-width: 1199px\)'\)/);
  assert.match(styles, /\.mobile-workspace-actions/);
});
