import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = (path) => readFile(new URL(path, root), 'utf8');
const findSmallTextViolations = (css) => {
  const allowedSmallText = /(?:\.paper-citation-line|\.paper-detail-chips|\.ranking-note|\.eyebrow|\.card-kicker|\.inference-label|\.abstract-label|\.paper-abstract-preview-label|\.paper-rank-number|#character-count|\.database-chips\s+span)/i;
  const violations = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*font-size:\s*(?:(?:0?\.[0-9]+)rem|[0-9]+px|var\(--font-(?:meta|label)\))[^{}]*)\}/gi)) {
    const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const declaration = match[2].match(/font-size:\s*([^;]+)/i)?.[1]?.trim() ?? '';
    const isSmallExplicit = /(?:rem|px)$/i.test(declaration) && ((declaration.endsWith('rem') && Number.parseFloat(declaration) < 1) || (declaration.endsWith('px') && Number.parseFloat(declaration) < 16));
    const isSmallToken = /var\(--font-(?:meta|label)\)/i.test(declaration);
    if ((isSmallExplicit || isSmallToken) && !allowedSmallText.test(selector)) violations.push(`${selector} => ${declaration}`);
  }
  return violations;
};

test('workspace shell exposes focused navigation, responsive controls, and account intent destinations', async () => {
  const html = await text('public/index.html');
  const css = await text('public/styles.css');
  assert.match(html, /id="workspace-shell"/);
  assert.match(html, /id="workspace-nav"[^>]*aria-label="Workspace navigation"/);
  assert.match(html, /id="workspace-menu-button"[^>]*aria-controls="workspace-nav"[^>]*aria-expanded="false"/);
  assert.match(html, /<button[^>]*data-auth-intent="saved-papers"[^>]*>\s*Saved papers\s*<\/button>/i);
  assert.match(html, /<button[^>]*data-auth-intent="conversations"[^>]*>\s*Conversations\s*<\/button>/i);
  assert.match(html, /<button[^>]*data-auth-intent="sign-in"[^>]*>\s*Sign in\s*<\/button>/i);
  for (const label of ['New analysis', 'Conference library', 'Saved papers', 'Conversations', 'Submit a program']) {
    assert.match(html, new RegExp(label, 'i'));
  }
  assert.match(css, /\.workspace-shell\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:/i);
  assert.match(css, /@media\s*\(max-width:\s*899px\)[\s\S]*\.workspace-shell\s*\{[\s\S]*display:\s*block[\s\S]*\.workspace-sidebar\s*\{[\s\S]*transform:\s*translateX\(-105%\)[\s\S]*\.workspace-sidebar\[data-open="true"\]\s*\{[\s\S]*transform:\s*translateX\(0\)/i);
});

test('essential typography meets the readable product contract', async () => {
  const css = `${await text('public/styles.css')}\n${await text('public/results-v2.css')}`;
  assert.match(css, /--font-body:\s*1\.125rem/);
  assert.match(css, /--font-control:\s*1rem/);
  assert.match(css, /--font-meta:\s*\.875rem/);
  assert.match(css, /--font-label:\s*\.8125rem/);
  assert.match(css, /body\s*\{[\s\S]*font-size:\s*var\(--font-body\)/i);
  assert.match(css, /button,\s*input,\s*textarea,\s*select\s*\{[\s\S]*font-size:\s*var\(--font-control\)/i);
  const essentialBlocks = css.match(/(?:button,\s*input,\s*textarea,\s*select|\.workspace-sidebar\s+a,\s*\.workspace-sidebar\s+button|table\s+th,\s*table\s+td)\s*\{[^}]*\}/gi) ?? [];
  assert.equal(essentialBlocks.length, 3);
  for (const block of essentialBlocks) {
    assert.match(block, /font-size:\s*var\(--font-control\)/i);
    assert.doesNotMatch(block, /font-size:\s*(?:0?\.[0-9]+|[0-9]+px)\s*;/i);
  }
  assert.match(css, /\.paper-citation-line[\s\S]*font-size:\s*var\(--font-meta\)/i);

});

test('global typography floor rejects unapproved small-text selectors', async () => {
  const css = `${await text('public/styles.css')}\n${await text('public/results-v2.css')}`;
  const violations = findSmallTextViolations(css);
  assert.deepEqual(violations, [], `unapproved sub-16px declarations: ${violations.join(' | ')}`);
});

test('each related paper is appended exactly once', async () => {
  const script = await text('public/app.js');
  const matches = script.match(/list\.append\(article\)/g) ?? [];
  assert.equal(matches.length, 1);
});
