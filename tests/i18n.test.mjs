import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../public/i18n.js';
import { createWorkspaceUiState, initWorkspaceNavigation } from '../public/workspace.js';

test('translator resolves English, Chinese, interpolation, and fallback', () => {
  assert.equal(createTranslator({ locale: 'en' }).t('nav.newAnalysis'), 'New analysis');
  assert.equal(createTranslator({ locale: 'zh' }).t('nav.newAnalysis'), '新分析');
  assert.equal(createTranslator({ locale: 'zh' }).t('corpus.paperCount', { count: '8,906' }), '实时语料 · 8,906 篇论文');
  assert.equal(createTranslator({ locale: 'de' }).locale, 'en');
});

test('workspace UI state preserves semantic busy, progress, error, and auth state across locales', () => {
  const state = createWorkspaceUiState();
  state.setBusy(true);
  state.setProgress({ value: 55, key: 'progress.stage.retrieval', hidden: false });
  state.setError('error.analysis');
  state.setAuthIntent('saved-papers');

  const english = state.view(createTranslator({ locale: 'en' }).t);
  const chinese = state.view(createTranslator({ locale: 'zh' }).t);

  assert.equal(english.busy, true);
  assert.equal(english.progress.value, 55);
  assert.equal(english.progress.hidden, false);
  assert.equal(english.progress.label, 'Running Hybrid vector + full-text retrieval');
  assert.equal(english.submitLabel, 'Scanning corpus…');
  assert.equal(english.error, 'The analysis could not be completed.');
  assert.equal(english.auth, 'Saved papers is coming soon. Sign-in and saved work are not available in this stage.');
  assert.equal(chinese.progress.label, '正在运行混合向量与全文检索');
  assert.equal(chinese.submitLabel, '正在扫描语料库…');
  assert.equal(chinese.error, '分析无法完成。');
  assert.equal(chinese.auth, '收藏论文 即将推出。本阶段尚不支持登录或保存工作。');
});

test('save, export, and sign-in feedback remains localized', () => {
  const state = createWorkspaceUiState();
  const expectations = [
    ['save-paper', 'Saving papers is coming soon.', '保存论文 即将推出。'],
    ['export', 'Private-workspace export is coming soon.', '私有工作区导出 即将推出。'],
    ['sign-in', 'Sign-in is coming soon.', '登录 即将推出。'],
  ];

  for (const [intent, englishPrefix, chinesePrefix] of expectations) {
    state.setAuthIntent(intent);
    assert.ok(state.view(createTranslator({ locale: 'en' }).t).auth.startsWith(englishPrefix));
    assert.ok(state.view(createTranslator({ locale: 'zh' }).t).auth.startsWith(chinesePrefix));
  }
});

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.focused = false;
    this.inert = false;
    this.firstNavigationControl = null;
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  dispatch(type, event = {}) { this.listeners.get(type)?.(event); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  focus() { this.focused = true; }
  querySelector(selector) {
    return selector.includes('nav a[href]') ? this.firstNavigationControl : null;
  }
}

class FakeMediaQuery {
  constructor(matches) {
    this.matches = matches;
    this.listeners = new Set();
  }

  addEventListener(type, listener) {
    if (type === 'change') this.listeners.add(listener);
  }

  setMatches(matches) {
    this.matches = matches;
    for (const listener of this.listeners) listener({ matches });
  }
}

test('workspace navigation removes a closed mobile drawer from focus and restores focus on close', () => {
  const previousDocument = globalThis.document;
  const documentListeners = new Map();
  globalThis.document = { addEventListener(type, listener) { documentListeners.set(type, listener); } };
  try {
    const sidebar = new FakeElement();
    const menuButton = new FakeElement();
    const firstNavigationControl = new FakeElement();
    const mobileQuery = new FakeMediaQuery(true);
    sidebar.firstNavigationControl = firstNavigationControl;
    const intents = [];
    initWorkspaceNavigation({
      sidebar,
      menuButton,
      mobileQuery,
      authIntentHandler(intent) { intents.push(intent); },
    });

    assert.equal(sidebar.inert, true);
    menuButton.dispatch('click');
    assert.equal(sidebar.dataset.open, 'true');
    assert.equal(menuButton.getAttribute('aria-expanded'), 'true');
    assert.equal(sidebar.inert, false);
    assert.equal(firstNavigationControl.focused, true);

    documentListeners.get('keydown')({ key: 'Escape' });
    assert.equal(sidebar.dataset.open, 'false');
    assert.equal(menuButton.getAttribute('aria-expanded'), 'false');
    assert.equal(sidebar.inert, true);
    assert.equal(menuButton.focused, true);

    menuButton.dispatch('click');
    sidebar.dispatch('click', {
      target: { closest(selector) { return selector === '[data-auth-intent]' ? { dataset: { authIntent: 'saved-papers' } } : null; } },
    });
    assert.deepEqual(intents, ['saved-papers']);
    assert.equal(sidebar.dataset.open, 'false');

    menuButton.dispatch('click');
    sidebar.dispatch('click', {
      target: { closest(selector) { return selector === 'a[href]' ? {} : null; } },
    });
    assert.equal(sidebar.dataset.open, 'false');
  } finally {
    globalThis.document = previousDocument;
  }
});

test('workspace navigation media changes never make desktop navigation inert', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { addEventListener() {} };
  try {
    const sidebar = new FakeElement();
    const menuButton = new FakeElement();
    const firstNavigationControl = new FakeElement();
    const mobileQuery = new FakeMediaQuery(true);
    sidebar.firstNavigationControl = firstNavigationControl;
    const navigation = initWorkspaceNavigation({ sidebar, menuButton, mobileQuery });

    assert.equal(sidebar.inert, true);
    navigation.setOpen(true);
    assert.equal(sidebar.inert, false);

    mobileQuery.setMatches(false);
    assert.equal(sidebar.inert, false);
    assert.equal(sidebar.dataset.open, 'false');
    assert.equal(menuButton.getAttribute('aria-expanded'), 'false');

    navigation.setOpen(true);
    assert.equal(sidebar.inert, false);
    assert.equal(sidebar.dataset.open, 'false');

    mobileQuery.setMatches(true);
    assert.equal(sidebar.inert, true);
  } finally {
    globalThis.document = previousDocument;
  }
});
