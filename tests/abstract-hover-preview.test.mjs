import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

test('paper titles and grounded references expose the canonical abstract on hover, focus, and click', async () => {
  const script = await readFile(path.join(publicDir, 'app.js'), 'utf8');
  const styles = await readFile(path.join(publicDir, 'results-v2.css'), 'utf8');

  // Provided evidenceReferences do not carry abstracts, so the browser must
  // enrich them from the canonical relatedPapers payload by paperId.
  assert.match(script, /function\s+resolveEvidenceReferences[\s\S]*paperById[\s\S]*abstract/);

  // Ranked-paper titles and evidence citations must both render an actual
  // abstract preview instead of relying on an ID or a source URL alone.
  assert.match(script, /paper-title-preview-wrap/);
  assert.match(script, /grounding-reference-wrap/);
  assert.match(script, /paper-abstract-preview/);
  assert.match(script, /paper\.abstract/);
  assert.match(script, /reference\.abstract/);

  // Click/tap keeps the preview open; aria-expanded mirrors that state.
  assert.match(script, /data-preview-open/);
  assert.match(script, /aria-expanded/);
  assert.match(script, /addEventListener\(['"]click['"]/);

  // Desktop pointer hover and keyboard focus reveal the preview; the click
  // state also supports touch devices where hover does not exist.
  assert.match(styles, /\.paper-title-preview-wrap:hover[\s\S]*\.paper-abstract-preview/);
  assert.match(styles, /\.paper-title-preview-wrap:focus-within[\s\S]*\.paper-abstract-preview/);
  assert.match(styles, /\.grounding-reference-wrap:hover[\s\S]*\.paper-abstract-preview/);
  assert.match(styles, /\.grounding-reference-wrap:focus-within[\s\S]*\.paper-abstract-preview/);
  assert.match(styles, /\[data-preview-open=['"]true['"]\][\s\S]*\.paper-abstract-preview/);

  // The floating preview must render above report cards instead of being
  // visually clipped or hidden behind neighboring content.
  assert.match(styles, /\.paper-abstract-preview\s*\{[\s\S]*position:\s*absolute[\s\S]*z-index:\s*\d+/i);
});
