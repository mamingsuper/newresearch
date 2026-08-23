import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = (path) => readFile(new URL(path, root), 'utf8');
const allowedSmallTextSelectors = [
  /^\.paper-citation-line(?:\s+(?:strong|span))?$/i,
  /^\.paper-detail-chips(?:\s+span)?$/i,
  /^\.ranking-note$/i,
  /^\.eyebrow$/i,
  /^\.card-kicker$/i,
  /^\.inference-label$/i,
  /^\.abstract-label$/i,
  /^\.paper-abstract-preview-label$/i,
  /^\.paper-rank-number$/i,
  /^#character-count$/i,
  /^\.database-chips\s+span$/i,
];
const allowedSmallTextSelector = (selector) => allowedSmallTextSelectors.some((pattern) => pattern.test(selector.trim()));
const isSmallFontSize = (declaration) => {
  const value = declaration.trim().replace(/\s*!\s*important\s*$/i, '');
  if (/^var\(\s*--font-(?:meta|label)\s*\)$/i.test(value)) return true;

  const match = value.match(/^(\d+(?:\.\d+)?|\.\d+)\s*(px|rem)$/i);
  if (!match) return false;

  const pixels = Number(match[1]) * (match[2].toLowerCase() === 'rem' ? 16 : 1);
  return pixels < 16;
};
const findSmallTextViolations = (css) => {
  const violations = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .map((selector) => selector.trim())
      .filter(Boolean);
    for (const declaration of match[2].matchAll(/\bfont-size\s*:\s*([^;}]+)/gi)) {
      const value = declaration[1].trim();
      if (!isSmallFontSize(value)) continue;
      for (const selector of selectors) {
        if (!allowedSmallTextSelector(selector)) violations.push(`${selector} => ${value}`);
      }
    }
  }
  return violations;
};

test('typography floor audit permits allowed metadata and label selectors', () => {
  const violations = findSmallTextViolations(`
    .paper-citation-line { font-size: var(--font-meta); }
    .paper-detail-chips { font-size: var(--font-label) !important; }
  `);

  assert.deepEqual(violations, []);
});

test('typography floor audit rejects important, decimal, and mixed-selector small text', () => {
  const violations = findSmallTextViolations(`
    .unapproved-important { font-size: 15px !important; }
    .unapproved-decimal-pixel { font-size: 15.5px; }
    .unapproved-decimal-rem { font-size: .96875rem; }
    .unapproved-important-token { font-size: var(--font-label) !important; }
    .paper-citation-line, .unapproved-companion { font-size: var(--font-meta); }
  `);

  assert.deepEqual(violations, [
    '.unapproved-important => 15px !important',
    '.unapproved-decimal-pixel => 15.5px',
    '.unapproved-decimal-rem => .96875rem',
    '.unapproved-important-token => var(--font-label) !important',
    '.unapproved-companion => var(--font-meta)',
  ]);
});

test('typography floor audit recognizes integer rem lower and passing boundaries', () => {
  const violations = findSmallTextViolations(`
    .unapproved-zero-rem { font-size: 0rem; }
    .unapproved-one-rem { font-size: 1rem; }
  `);

  assert.deepEqual(violations, [
    '.unapproved-zero-rem => 0rem',
  ]);
});

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

test('paper result actions are explicit and do not pretend to persist', async () => {
  const script = await text('public/app.js');
  const i18n = await text('public/i18n.js');
  assert.match(script, /data-paper-action/);
  assert.match(script, /data-export-format/);
  assert.match(script, /requiresAccount/);
  assert.match(script, /requiresAccount\('save-paper', paper\.paperId\)/);
  assert.match(script, /showUnavailableAction\('action\.exportUnavailable'\)/);
  assert.match(i18n, /'auth\.intent\.save-paper':/);
  assert.match(i18n, /'auth\.intent\.export':/);
  assert.doesNotMatch(script, /localStorage\.setItem\([^)]*idea/i);
});
