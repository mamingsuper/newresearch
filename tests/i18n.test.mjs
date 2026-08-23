import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../public/i18n.js';
import { initWorkspaceNavigation } from '../public/workspace.js';

test('translator resolves English, Chinese, interpolation, and fallback', () => {
  assert.equal(createTranslator({ locale: 'en' }).t('nav.newAnalysis'), 'New analysis');
  assert.equal(createTranslator({ locale: 'zh' }).t('nav.newAnalysis'), '新分析');
  assert.equal(createTranslator({ locale: 'zh' }).t('corpus.paperCount', { count: '8,906' }), '实时语料 · 8,906 篇论文');
  assert.equal(createTranslator({ locale: 'de' }).locale, 'en');
});

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.focused = false;
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  dispatch(type, event = {}) { this.listeners.get(type)?.(event); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  focus() { this.focused = true; }
}

test('workspace navigation synchronizes mobile state and delegates account intent', () => {
  const previousDocument = globalThis.document;
  const documentListeners = new Map();
  globalThis.document = { addEventListener(type, listener) { documentListeners.set(type, listener); } };
  try {
    const sidebar = new FakeElement();
    const menuButton = new FakeElement();
    const intents = [];
    initWorkspaceNavigation({
      sidebar,
      menuButton,
      authIntentHandler(intent) { intents.push(intent); },
    });

    menuButton.dispatch('click');
    assert.equal(sidebar.dataset.open, 'true');
    assert.equal(menuButton.getAttribute('aria-expanded'), 'true');

    documentListeners.get('keydown')({ key: 'Escape' });
    assert.equal(sidebar.dataset.open, 'false');
    assert.equal(menuButton.getAttribute('aria-expanded'), 'false');
    assert.equal(menuButton.focused, true);

    menuButton.dispatch('click');
    sidebar.dispatch('click', {
      target: { closest(selector) { return selector === '[data-auth-intent]' ? { dataset: { authIntent: 'saved-papers' } } : null; } },
    });
    assert.deepEqual(intents, ['saved-papers']);
    assert.equal(sidebar.dataset.open, 'false');
  } finally {
    globalThis.document = previousDocument;
  }
});
