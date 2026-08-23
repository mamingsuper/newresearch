import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../public/i18n.js';
import {
  createCorpusStatusModel,
  presentRenderedReport,
  scrollBehaviorForMotionPreference,
} from '../public/workspace-behaviors.js';

test('scroll behavior uses auto for reduced motion and smooth otherwise', () => {
  assert.equal(scrollBehaviorForMotionPreference(true), 'auto');
  assert.equal(scrollBehaviorForMotionPreference(false), 'smooth');
});

test('initial report presentation focuses before motion-aware scrolling', () => {
  const calls = [];
  const section = {
    hidden: true,
    focus(options) { calls.push(['focus', options]); },
    scrollIntoView(options) { calls.push(['scroll', options]); },
  };

  presentRenderedReport(section, { scroll: true, prefersReducedMotion: true });

  assert.equal(section.hidden, false);
  assert.deepEqual(calls, [
    ['focus', { preventScroll: true }],
    ['scroll', { behavior: 'auto', block: 'start' }],
  ]);
});

test('locale report rerender reveals content without stealing focus or scrolling', () => {
  const calls = [];
  const section = {
    hidden: true,
    focus(options) { calls.push(['focus', options]); },
    scrollIntoView(options) { calls.push(['scroll', options]); },
  };

  presentRenderedReport(section, { scroll: false, prefersReducedMotion: false });

  assert.equal(section.hidden, false);
  assert.deepEqual(calls, []);
});

test('corpus status model keeps a failed lookup render-safe in English and Chinese', () => {
  for (const [locale, expectedMode] of [['en', 'Corpus'], ['zh', '语料库']]) {
    const model = createCorpusStatusModel({}, undefined, createTranslator({ locale }).t);
    assert.deepEqual(model.corpus.conferences, []);
    assert.equal(model.ledgerText, '');
    assert.equal(model.modeText, expectedMode);
  }
});

test('corpus status model formats normalized conference data in English and Chinese', () => {
  const corpus = {
    conferences: [
      { name: 'APSA', year: 2026, papers: 5493 },
      { name: 'ICA', year: 2026, papers: 3413 },
    ],
    paperCount: 8906,
    papersWithAbstract: 8906,
  };
  const english = createCorpusStatusModel(corpus, undefined, createTranslator({ locale: 'en' }).t);
  const chinese = createCorpusStatusModel(corpus, undefined, createTranslator({ locale: 'zh' }).t);

  assert.equal(english.ledgerText, 'APSA 2026 · 5,493 papers + ICA 2026 · 3,413 papers = 8,906 abstracts');
  assert.equal(english.modeText, 'Corpus · 8,906 papers');
  assert.equal(chinese.ledgerText, 'APSA 2026 · 5,493 篇论文 + ICA 2026 · 3,413 篇论文 = 8,906 篇摘要');
  assert.equal(chinese.modeText, '语料库 · 8,906 篇论文');
});
