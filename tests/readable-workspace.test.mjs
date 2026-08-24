import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = (path) => readFile(new URL(path, root), 'utf8');
const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
};
const relativeLuminance = (hex) => {
  const channels = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrastRatio = (left, right) => {
  const [lighter, darker] = [relativeLuminance(left), relativeLuminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};
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
  assert.match(css, /\.workspace-shell\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--sidebar-width\)\s+minmax\(0,\s*1fr\)/i);
  assert.match(css, /\.workspace-sidebar\s*\{[^}]*position:\s*sticky;[^}]*height:\s*100dvh;[^}]*border-right:/i);
  assert.match(css, /@media\s*\(max-width:\s*1199px\)[\s\S]*\.workspace-sidebar\s*\{[\s\S]*transform:\s*translateX\(-105%\)[\s\S]*\.workspace-sidebar\[data-open="true"\]\s*\{[\s\S]*transform:\s*translateX\(0\)[\s\S]*\.mobile-workspace-header\s*\{[\s\S]*display:\s*flex/i);
  assert.match(css, /\.workspace-sidebar\s*\{[^}]*overflow-y:\s*auto/i);
});

test('localized account feedback lives outside the mobile sidebar', async () => {
  const html = await text('public/index.html');
  const sidebarEnd = html.indexOf('</aside>');
  const status = html.indexOf('id="auth-intent-status"');
  const main = html.indexOf('<main id="workspace-main"');

  assert.ok(sidebarEnd >= 0 && status > sidebarEnd && status < main);
  assert.match(html.slice(status - 120, status + 160), /role="status"[^>]*aria-live="polite"/i);
});

test('report target is programmatically focusable', async () => {
  const html = await text('public/index.html');
  assert.match(html, /id="report-section"[^>]*tabindex="-1"/i);
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

test('reduced motion disables workspace and result transitions', async () => {
  const workspaceCss = await text('public/styles.css');
  const resultCss = await text('public/results-v2.css');
  assert.match(workspaceCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*html\s*\{[\s\S]*scroll-behavior:\s*auto/i);
  assert.match(workspaceCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.workspace-sidebar\s*\{[\s\S]*(?:transition|animation):\s*none/i);
  assert.match(workspaceCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*#progress-bar\s*\{[\s\S]*(?:transition|animation):\s*none/i);
  assert.match(workspaceCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.primary-button\s*\{[\s\S]*(?:transition|animation):\s*none/i);
  assert.match(resultCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.paper-abstract-preview\s*\{[\s\S]*(?:transition|animation):\s*none/i);
});

test('canonical normal-text color combinations meet WCAG AA contrast', async () => {
  const css = await text('public/styles.css');
  const tokenEntries = [...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)]
    .map(([, name, value]) => [name, value.toLowerCase()]);
  const tokens = Object.fromEntries(tokenEntries);
  const combinations = [
    ['ink', 'paper'],
    ['muted', 'paper'],
    ['muted', 'surface-strong'],
    ['blue', 'white'],
    ['blue', 'surface-strong'],
    ['green', 'white'],
    ['green', 'surface-strong'],
    ['placeholder', 'surface-strong'],
  ];
  tokens.white = '#ffffff';

  for (const [foreground, background] of combinations) {
    assert.ok(tokens[foreground], `missing --${foreground}`);
    assert.ok(tokens[background], `missing --${background}`);
    const ratio = contrastRatio(tokens[foreground], tokens[background]);
    assert.ok(ratio >= 4.5, `${foreground} on ${background} is ${ratio.toFixed(2)}:1`);
  }
  assert.match(css, /textarea::placeholder\s*\{[^}]*color:\s*var\(--placeholder\)/i);
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
  assert.match(script, /exportPapers\(\[paper\], 'bibtex'\)/);
  assert.match(script, /downloadExport/);
  assert.match(i18n, /'auth\.intent\.save-paper':/);
  assert.match(i18n, /'auth\.intent\.export':/);
  assert.doesNotMatch(script, /localStorage\.setItem\([^)]*idea/i);
});
