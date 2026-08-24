# Readable Focused Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense public landing layout with a readable, responsive research workspace while preserving anonymous analysis and the current Edge API contract.

**Architecture:** Keep the static HTML/CSS/ES-module frontend. Add a semantic application shell, a small translation module, and focused rendering helpers without changing Supabase or the production corpus. The analysis form remains the primary public action; account-dependent destinations render as inert, accessible placeholders until the Auth stage.

**Tech Stack:** HTML5, CSS3, Vanilla JavaScript ES modules, Node test runner, GitHub Pages

**Spec:** `docs/superpowers/specs/2026-08-23-product-workspace-expansion-design.md`

## Global Constraints

- Desktop body and abstracts are at least 18px; mobile body and abstracts are at least 17px.
- Inputs, buttons, navigation, and table cells are at least 16px; secondary metadata is at least 14px.
- Anonymous idea analysis and the existing `analyze-idea` / `corpus-status` contracts remain unchanged.
- Do not use `innerHTML`; all dynamic content uses `textContent`/DOM nodes.
- Do not persist raw ideas or reports.
- Keep Pages assets subpath-safe and keep the current secret scan green.

---

### Task 1: Lock the workspace and typography contract with failing tests

**Files:**
- Create: `tests/readable-workspace.test.mjs`
- Modify: `tests/static-ui.test.mjs`

**Interfaces:**
- Consumes: `public/index.html`, `public/styles.css`, `public/results-v2.css`, `public/app.js`
- Produces: executable assertions for shell landmarks, typography tokens, responsive navigation, and one-render-per-paper behavior

- [ ] **Step 1: Write the failing contract tests**

```js
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
```

- [ ] **Step 2: Run the new tests and verify failure**

Run: `node --test tests/readable-workspace.test.mjs tests/static-ui.test.mjs`

Expected: FAIL because `workspace-shell`, typography tokens, and navigation do not exist and `app.js` appends each related paper twice.

- [ ] **Step 3: Update obsolete size assertions in the existing test**

Replace the 16px body expectation with `--font-body: 1.125rem`, and replace the 1rem abstract expectation with a token-based 18px/17px assertion. Do not weaken the Pages-safe asset, safe DOM rendering, progress, or corpus assertions.

- [ ] **Step 4: Commit the failing contract**

```bash
git add tests/readable-workspace.test.mjs tests/static-ui.test.mjs
git commit -m "test: define readable workspace contract"
```

### Task 2: Add the focused application shell and typography system

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/results-v2.css`

**Interfaces:**
- Consumes: existing element IDs used by `public/app.js`
- Produces: `#workspace-shell`, `#workspace-nav`, `#workspace-main`, `#workspace-menu-button`, and CSS tokens `--font-body`, `--font-control`, `--font-meta`, `--font-label`

- [ ] **Step 1: Preserve all JavaScript-bound IDs while restructuring the markup**

Use this semantic frame around the existing analysis, progress, report, privacy, and footer content:

```html
<div class="workspace-shell" id="workspace-shell">
  <aside class="workspace-sidebar" id="workspace-nav" aria-label="Workspace navigation">
    <a class="brand" href="#new-analysis">Idea Radar</a>
    <nav>
      <a href="#new-analysis" aria-current="page">New analysis</a>
      <a href="#conference-library">Conference library</a>
      <button type="button" data-auth-intent="saved-papers">Saved papers</button>
      <button type="button" data-auth-intent="conversations">Conversations</button>
      <a href="#submit-program">Submit a program</a>
    </nav>
    <button class="account-entry" type="button" data-auth-intent="sign-in">Sign in</button>
  </aside>
  <div class="workspace-content">
    <header class="mobile-workspace-header">
      <a class="brand" href="#new-analysis">Idea Radar</a>
      <button id="workspace-menu-button" type="button" aria-controls="workspace-nav" aria-expanded="false">Menu</button>
    </header>
    <main id="workspace-main">…existing sections…</main>
  </div>
</div>
```

Add honest preview sections for Conference library and Submit a program that explain those capabilities are arriving with the next stages; do not create fake data or active persistence controls.

- [ ] **Step 2: Replace ad-hoc small sizes with explicit tokens**

```css
:root {
  --font-body: 1.125rem;
  --font-control: 1rem;
  --font-meta: .875rem;
  --font-label: .8125rem;
  --reading-width: 61.25rem;
  --sidebar-width: 15.5rem;
}
body { font-size: var(--font-body); line-height: 1.65; }
button, input, textarea, select { font-size: var(--font-control); }
.workspace-content main { min-width: 0; }
.query-hero, .report-shell { width: min(100%, var(--reading-width)); margin-inline: auto; }
.paper-abstract { font-size: var(--font-body); line-height: 1.7; max-width: 78ch; }
.paper-citation-line, .paper-detail-chips, .ranking-note { font-size: var(--font-meta); }
.eyebrow, .card-kicker, .inference-label { font-size: var(--font-label); }
```

Remove or raise every essential `.66rem`–`.8rem` rule. Decorative rank numerals may be visually small only if an equivalent accessible label remains at 14px or larger.

- [ ] **Step 3: Implement desktop concentration and mobile collapse**

```css
.workspace-shell { display: grid; grid-template-columns: var(--sidebar-width) minmax(0, 1fr); min-height: 100vh; }
.workspace-sidebar { position: sticky; top: 0; height: 100vh; padding: 1.5rem; border-right: 1px solid var(--line); }
.mobile-workspace-header { display: none; }
@media (max-width: 899px) {
  :root { --font-body: 1.0625rem; }
  .workspace-shell { display: block; }
  .workspace-sidebar { position: fixed; inset: 0 auto 0 0; width: min(88vw, 20rem); transform: translateX(-105%); }
  .workspace-sidebar[data-open="true"] { transform: translateX(0); }
  .mobile-workspace-header { display: flex; min-height: 4rem; }
}
```

- [ ] **Step 4: Run contract tests**

Run: `node --test tests/readable-workspace.test.mjs tests/static-ui.test.mjs tests/abstract-hover-preview.test.mjs`

Expected: typography and shell assertions PASS; the duplicate-paper assertion still FAILS until Task 4.

- [ ] **Step 5: Commit the shell**

```bash
git add public/index.html public/styles.css public/results-v2.css
git commit -m "feat: add readable focused workspace shell"
```

### Task 3: Add bilingual copy infrastructure and accessible navigation behavior

**Files:**
- Create: `public/i18n.js`
- Create: `public/workspace.js`
- Create: `tests/i18n.test.mjs`
- Modify: `public/app.js`
- Modify: `public/index.html`

**Interfaces:**
- Produces: `createTranslator({ locale }) -> { t(key, params), locale }`
- Produces: `initWorkspaceNavigation({ sidebar, menuButton, authIntentHandler })`
- Consumes: locale values `en` and `zh`; unknown locales fall back to `en`

- [ ] **Step 1: Write failing unit tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../public/i18n.js';

test('translator resolves English, Chinese, interpolation, and fallback', () => {
  assert.equal(createTranslator({ locale: 'en' }).t('nav.newAnalysis'), 'New analysis');
  assert.equal(createTranslator({ locale: 'zh' }).t('nav.newAnalysis'), '新分析');
  assert.equal(createTranslator({ locale: 'zh' }).t('corpus.paperCount', { count: '8,906' }), '实时语料 · 8,906 篇论文');
  assert.equal(createTranslator({ locale: 'de' }).locale, 'en');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/i18n.test.mjs`

Expected: FAIL with module-not-found for `public/i18n.js`.

- [ ] **Step 3: Implement a closed translation dictionary**

```js
const messages = Object.freeze({
  en: Object.freeze({ 'nav.newAnalysis': 'New analysis', 'nav.savedPapers': 'Saved papers', 'corpus.paperCount': 'Live corpus · {count} papers' }),
  zh: Object.freeze({ 'nav.newAnalysis': '新分析', 'nav.savedPapers': '收藏论文', 'corpus.paperCount': '实时语料 · {count} 篇论文' }),
});
export function createTranslator({ locale = 'en' } = {}) {
  const active = Object.hasOwn(messages, locale) ? locale : 'en';
  return { locale: active, t(key, params = {}) { return (messages[active][key] ?? messages.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`)); } };
}
```

Expand the dictionary to every visible shell, form, progress, report, privacy, error, and placeholder string before switching `app.js` to `t()`.

- [ ] **Step 4: Implement navigation and language preference**

`initWorkspaceNavigation` toggles `data-open`, keeps `aria-expanded` synchronized, closes on Escape and after navigation, returns focus to the menu button, and sends account-dependent clicks to `authIntentHandler`. Store anonymous locale as `idea-radar-locale` in localStorage; do not store ideas.

- [ ] **Step 5: Run unit and static tests**

Run: `node --test tests/i18n.test.mjs tests/readable-workspace.test.mjs tests/static-ui.test.mjs`

Expected: PASS except the duplicate-paper assertion reserved for Task 4.

- [ ] **Step 6: Commit**

```bash
git add public/i18n.js public/workspace.js public/app.js public/index.html tests/i18n.test.mjs
git commit -m "feat: add bilingual accessible workspace navigation"
```

### Task 4: Simplify paper results and add honest future-action affordances

**Files:**
- Modify: `public/app.js`
- Modify: `public/results-v2.css`
- Modify: `tests/readable-workspace.test.mjs`
- Modify: `tests/static-ui.test.mjs`

**Interfaces:**
- Produces: one `.related-paper-card` per `relatedPapers` item
- Produces: buttons with `data-paper-action="save"` and `data-export-format` that call an injected unavailable-action handler until Stage B

- [ ] **Step 1: Extend the failing result-action test**

```js
test('paper result actions are explicit and do not pretend to persist', async () => {
  const script = await text('public/app.js');
  assert.match(script, /data-paper-action/);
  assert.match(script, /data-export-format/);
  assert.match(script, /requiresAccount/);
  assert.doesNotMatch(script, /localStorage\.setItem\([^)]*idea/i);
});
```

- [ ] **Step 2: Remove the duplicate append and add a compact action row**

Delete the second consecutive `list.append(article)`. Add Save and Export buttons after the source link. Save calls `requiresAccount('save-paper', paper.paperId)`. Export calls `showUnavailableAction('Export arrives with your private workspace')`; Stage B replaces this handler with the pure exporter. Neither placeholder claims persistence or download success.

- [ ] **Step 3: Reduce metadata competition**

Keep title, citation, and abstract in the primary reading column. Move score, division, keywords, and source into a visually secondary `.paper-meta-row`; retain every value and accessible label.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/readable-workspace.test.mjs tests/static-ui.test.mjs tests/abstract-hover-preview.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/results-v2.css tests/readable-workspace.test.mjs tests/static-ui.test.mjs
git commit -m "fix: clarify ranked paper reading and actions"
```

### Task 5: Verify Pages output and rendered accessibility

**Files:**
- Create: `docs/qa/2026-08-23-readable-workspace.md`
- Modify: `.gitignore`

**Interfaces:**
- Produces: reproducible QA record covering desktop, mobile, keyboard, reduced motion, and 200% zoom

- [ ] **Step 1: Ignore the visual-companion workspace**

Add exactly:

```gitignore
.superpowers/
```

- [ ] **Step 2: Run all automated gates**

Run: `npm test && npm run check && npm run build && npm run pages:build`

Expected: all commands exit 0; Pages artifact contains only subpath-safe assets and no secret-shaped strings.

- [ ] **Step 3: Run the local app and perform rendered QA**

Run: `npm run dev`

Verify at 1440px, 900px, 390px, and 200% zoom:

- one dominant analysis column;
- no essential text under the typography contract;
- sidebar/drawer keyboard operation and focus return;
- 20 returned papers render once each;
- abstracts do not overflow;
- reduced-motion preference removes smooth progress/scroll behavior;
- English and Chinese labels do not clip.

Record viewport, result, and any accepted limitation in `docs/qa/2026-08-23-readable-workspace.md`.

- [ ] **Step 4: Commit the verified stage**

```bash
git add .gitignore docs/qa/2026-08-23-readable-workspace.md
git commit -m "docs: verify readable workspace"
```
