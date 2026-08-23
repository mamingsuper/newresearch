import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = (path) => readFile(new URL(path, root), 'utf8');

test('workspace shell exposes focused navigation and account-aware destinations', async () => {
  const html = await text('public/index.html');
  assert.match(html, /id="workspace-shell"/);
  assert.match(html, /aria-label="Workspace navigation"/);
  for (const label of ['New analysis', 'Conference library', 'Saved papers', 'Conversations', 'Submit a program']) {
    assert.match(html, new RegExp(label, 'i'));
  }
});

test('essential typography meets the readable product contract', async () => {
  const css = `${await text('public/styles.css')}\n${await text('public/results-v2.css')}`;
  assert.match(css, /--font-body:\s*1\.125rem/);
  assert.match(css, /--font-control:\s*1rem/);
  assert.match(css, /--font-meta:\s*\.875rem/);
  assert.doesNotMatch(css, /font-size:\s*\.(?:6|7)\d*rem/);
});

test('each related paper is appended exactly once', async () => {
  const script = await text('public/app.js');
  const matches = script.match(/list\.append\(article\)/g) ?? [];
  assert.equal(matches.length, 1);
});
