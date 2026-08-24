import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [motion, styles, html] = await Promise.all([
  readFile(new URL('../public/motion.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
]);

test('premium motion is reveal-driven, reduced-motion safe, and avoids scroll listeners', () => {
  assert.match(motion, /IntersectionObserver/);
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(motion, /addEventListener\(['"]scroll/);
  assert.match(styles, /\.motion-reveal\.is-visible/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('premium hero uses the local evidence-network visual asset', () => {
  assert.match(html, /assets\/evidence-network\.jpg/);
  assert.match(styles, /assets\/evidence-network\.jpg/);
});
