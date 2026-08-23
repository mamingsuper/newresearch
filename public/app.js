import { createTranslator } from './i18n.js';
import { initWorkspaceNavigation } from './workspace.js';

const LOCALE_STORAGE_KEY = 'idea-radar-locale';
const readLocale = () => {
  try { return window.localStorage.getItem(LOCALE_STORAGE_KEY) ?? 'en'; } catch { return 'en'; }
};
let translator = createTranslator({ locale: readLocale() });
let t = translator.t;

const form = document.querySelector('#analysis-form');
const ideaInput = document.querySelector('#idea-input');
const submitButton = document.querySelector('#submit-button');
const exampleButton = document.querySelector('#example-button');
const exampleChips = [...document.querySelectorAll('[data-example-key]')];
const formError = document.querySelector('#form-error');
const characterCount = document.querySelector('#character-count');
const reportSection = document.querySelector('#report-section');
const reportRoot = document.querySelector('#report-root');
const modeBadge = document.querySelector('#mode-badge');
const corpusLedger = document.querySelector('#corpus-ledger');
const searchProgress = document.querySelector('#search-progress');
const progressBar = document.querySelector('#progress-bar');
const progressPercent = document.querySelector('#progress-percent');
const progressStage = document.querySelector('#progress-stage');
const localeSelector = document.querySelector('#locale-selector');
const authIntentStatus = document.querySelector('#auth-intent-status');

const PROGRESS_STAGES = [
  { target: 5, key: 'progress.stage.understanding' },
  { target: 20, key: 'progress.stage.scope' },
  { target: 35, key: 'progress.stage.embedding' },
  { target: 55, key: 'progress.stage.retrieval' },
  { target: 75, key: 'progress.stage.ranking' },
  { target: 90, key: 'progress.stage.analysis' },
  { target: 94, key: 'progress.stage.citations' },
];

let progressTimer = null;
let progressValue = 0;
let progressStageIndex = 0;
let progressHoldTicks = 0;
let latestCorpus = null;
let latestCorpusMode;
let latestReport = null;

const configuredApiBase = window.__IDEA_RADAR_CONFIG__?.apiBaseUrl?.trim();
const edgeApiBase = window.location.hostname === 'mamingsuper.github.io' && configuredApiBase
  ? configuredApiBase.replace(/\/$/, '')
  : '';

function apiEndpoint(edgePath, localPath) {
  return edgeApiBase ? `${edgeApiBase}/${edgePath}` : localPath;
}

function applyStaticTranslations() {
  document.documentElement.lang = translator.locale;
  document.title = t('document.title');
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder);
  for (const node of document.querySelectorAll('[data-i18n-aria-label]')) node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
}

function setLocale(locale) {
  translator = createTranslator({ locale });
  t = translator.t;
  try { window.localStorage.setItem(LOCALE_STORAGE_KEY, translator.locale); } catch { /* Preference is optional. */ }
  applyStaticTranslations();
  localeSelector.value = translator.locale;
  updateCharacterCount();
  if (latestCorpus) renderCorpusStatus(latestCorpus, latestCorpusMode);
  if (latestReport) renderReport(latestReport, { scroll: false });
}

function clearElement(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function element(tagName, options = {}) {
  const node = document.createElement(tagName);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    node.setAttribute(name, value);
  }
  return node;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatCount(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '—';
}

function formatScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score.toFixed(5) : '—';
}

function authorNames(authors) {
  return asArray(authors)
    .map((author) => author && typeof author === 'object' ? String(author.name ?? '').trim() : '')
    .filter(Boolean);
}

function appendTextList(parent, items, className = 'plain-list') {
  const list = element('ul', { className });
  for (const item of asArray(items)) list.append(element('li', { text: item }));
  parent.append(list);
}

function setAbstractPreviewOpen(wrapper, trigger, open) {
  wrapper.setAttribute('data-preview-open', open ? 'true' : 'false');
  trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function attachAbstractPreviewToggle(wrapper, trigger) {
  trigger.addEventListener('click', () => {
    const open = wrapper.getAttribute('data-preview-open') === 'true';
    setAbstractPreviewOpen(wrapper, trigger, !open);
  });
}

function createAbstractPreview(abstract, sourceUrl) {
  const text = String(abstract ?? '').trim() || t('report.abstractUnavailable');
  const preview = element('span', {
    className: 'paper-abstract-preview',
    attributes: { role: 'tooltip' },
  });
  preview.append(
    element('span', { className: 'paper-abstract-preview-label', text: t('report.abstract') }),
    element('span', { className: 'paper-abstract-preview-text', text }),
  );
  if (sourceUrl) {
    preview.append(element('a', {
      className: 'paper-abstract-preview-source',
      text: t('report.openProgram'),
      attributes: {
        href: sourceUrl,
        target: '_blank',
        rel: 'noreferrer noopener',
      },
    }));
  }
  return preview;
}

function createPaperTitlePreview(paper) {
  const wrapper = element('div', {
    className: 'paper-title-preview-wrap',
    attributes: { 'data-preview-open': 'false' },
  });
  const title = element('h4', {
    className: 'paper-title-preview-trigger',
    text: paper.title ?? t('report.untitled'),
    attributes: {
      tabindex: '0',
      role: 'button',
      'aria-expanded': 'false',
      'aria-label': t('report.showAbstract', { title: paper.title ?? t('report.thisPaper') }),
    },
  });
  attachAbstractPreviewToggle(wrapper, title);
  title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      title.click();
    }
  });
  wrapper.append(title, createAbstractPreview(paper.abstract, paper.sourceUrl));
  return wrapper;
}

function renderIdeaProfile(profile = {}) {
  const section = element('section', { className: 'report-card profile-card' });
  section.append(element('p', { className: 'card-kicker', text: t('report.ideaProfile') }));
  section.append(element('h3', { text: profile.summary ?? t('report.profileUnresolved') }));

  const facts = element('dl', { className: 'profile-grid' });
  const entries = [
    [t('report.topics'), asArray(profile.topics).length ? profile.topics.join(', ') : t('report.notResolved')],
    [t('report.population'), profile.population ?? t('report.notSpecified')],
    [t('report.method'), profile.method ?? t('report.notSpecified')],
    [t('report.mechanism'), asArray(profile.mechanisms).length ? profile.mechanisms.join(', ') : t('report.notSpecified')],
  ];
  for (const [label, value] of entries) {
    const group = element('div');
    group.append(element('dt', { text: label }));
    group.append(element('dd', { text: value }));
    facts.append(group);
  }
  section.append(facts);
  return section;
}

function renderRelatedPapers(items) {
  const papers = asArray(items)
    .slice()
    .sort((left, right) => Number(left.rank ?? Number.MAX_SAFE_INTEGER) - Number(right.rank ?? Number.MAX_SAFE_INTEGER));
  const section = element('section', { className: 'report-block' });
  const header = element('div', { className: 'section-heading related-heading' });
  header.append(element('p', { className: 'card-kicker', text: t('report.relatedPapers') }));
  const countLabel = papers.length === 20 ? t('report.topResults') : t('report.rankedRecords', { count: papers.length });
  header.append(element('h3', { text: papers.length ? countLabel : t('report.noRelated') }));
  section.append(header);

  const methodNote = element('p', {
    className: 'ranking-note',
    text: t('report.rankingNote'),
  });
  section.append(methodNote);

  if (!papers.length) {
    section.append(element('p', {
      className: 'empty-state',
      text: t('report.noEvidence'),
    }));
    return section;
  }

  const list = element('div', { className: 'related-paper-list' });
  for (const paper of papers) {
    const rank = Number.isInteger(Number(paper.rank)) ? Number(paper.rank) : list.childElementCount + 1;
    const article = element('article', {
      className: 'related-paper-card',
      attributes: { 'data-paper-id': paper.paperId ?? '' },
    });

    const rankColumn = element('div', { className: 'paper-rank' });
    rankColumn.append(
      element('span', { className: 'paper-rank-number', text: `#${String(rank).padStart(2, '0')}` }),
      element('span', { className: 'paper-score-label', text: t('report.relevance') }),
      element('strong', { className: 'paper-score', text: formatScore(paper.score) }),
    );

    const body = element('div', { className: 'paper-body' });
    const citationLine = element('div', { className: 'paper-citation-line' });
    citationLine.append(
      element('strong', { text: paper.authorYearLabel ?? t('report.conferencePaper') }),
      element('span', { text: paper.conference ?? t('report.conferenceRecord') }),
    );
    body.append(citationLine);
    body.append(createPaperTitlePreview(paper));

    const names = authorNames(paper.authors);
    if (names.length) body.append(element('p', { className: 'paper-authors', text: names.join(', ') }));

    const chips = element('div', { className: 'paper-detail-chips' });
    if (paper.division) chips.append(element('span', { text: paper.division }));
    for (const keyword of asArray(paper.keywords).slice(0, 8)) chips.append(element('span', { text: keyword }));
    if (chips.childElementCount) body.append(chips);

    body.append(element('p', { className: 'abstract-label', text: t('report.abstract') }));
    body.append(element('p', { className: 'paper-abstract', text: paper.abstract ?? t('report.abstractUnavailable') }));

    if (paper.sourceUrl) {
      body.append(element('a', {
        className: 'source-link',
        text: t('report.originalProgram'),
        attributes: {
          href: paper.sourceUrl,
          target: '_blank',
          rel: 'noreferrer noopener',
        },
      }));
    }

    article.append(rankColumn, body);
    list.append(article);
  }
  section.append(list);
  return section;
}

function resolveEvidenceReferences(path, relatedPapers) {
  const paperById = new Map(asArray(relatedPapers).map((paper) => [String(paper.paperId ?? ''), paper]));
  const provided = asArray(path.evidenceReferences);
  if (provided.length) {
    return provided.map((reference) => {
      const paper = paperById.get(String(reference.paperId ?? ''));
      return {
        ...reference,
        abstract: paper?.abstract ?? reference.abstract ?? '',
        sourceUrl: reference.sourceUrl ?? paper?.sourceUrl ?? '',
      };
    });
  }

  return asArray(path.evidencePaperIds)
    .map((paperId) => paperById.get(String(paperId)))
    .filter(Boolean)
    .map((paper) => ({
      paperId: paper.paperId,
      authorYearLabel: paper.authorYearLabel,
      title: paper.title,
      conference: paper.conference,
      abstract: paper.abstract,
      sourceUrl: paper.sourceUrl,
    }));
}

function renderInnovationPaths(paths, relatedPapers) {
  const pathItems = asArray(paths);
  const section = element('section', { className: 'report-block' });
  const header = element('div', { className: 'section-heading' });
  header.append(element('p', { className: 'card-kicker', text: t('report.innovationDirections') }));
  header.append(element('h3', { text: pathItems.length ? t('report.distinctive') : t('report.noDirection') }));
  section.append(header);

  if (!pathItems.length) {
    section.append(element('p', { className: 'empty-state', text: t('report.noPath') }));
    return section;
  }

  const list = element('ol', { className: 'innovation-list' });
  for (const path of pathItems) {
    const item = element('li');
    item.append(element('div', { className: 'inference-label', text: t('report.inference') }));
    item.append(element('h4', { text: path.title ?? t('report.direction') }));
    item.append(element('p', { text: path.rationale ?? '' }));

    const references = resolveEvidenceReferences(path, relatedPapers);
    if (references.length) {
      const grounding = element('div', { className: 'grounding-references' });
      grounding.append(element('span', { className: 'grounding-label', text: t('report.groundedIn') }));
      for (const reference of references) {
        const text = `${reference.authorYearLabel ?? t('report.conferencePaper')} — ${reference.title ?? t('report.untitled')}`;
        const wrapper = element('span', {
          className: 'grounding-reference-wrap',
          attributes: {
            'data-paper-id': reference.paperId ?? '',
            'data-preview-open': 'false',
          },
        });
        const trigger = element('button', {
          className: 'grounding-reference',
          text,
          attributes: {
            type: 'button',
            'aria-expanded': 'false',
            'aria-label': t('report.showAbstract', { title: reference.title ?? t('report.thisPaper') }),
          },
        });
        attachAbstractPreviewToggle(wrapper, trigger);
        wrapper.append(trigger, createAbstractPreview(reference.abstract, reference.sourceUrl));
        grounding.append(wrapper);
      }
      item.append(grounding);
    }
    list.append(item);
  }
  section.append(list);
  return section;
}

function renderReport(report, { scroll = true } = {}) {
  latestReport = report;
  clearElement(reportRoot);
  reportRoot.append(
    element('div', {
      className: 'coverage-notice',
      text: report.coverageNotice ?? t('report.coverageNotice'),
    }),
    renderIdeaProfile(report.ideaProfile),
    renderRelatedPapers(report.relatedPapers),
    renderInnovationPaths(report.innovationPaths, report.relatedPapers),
  );

  const finalGrid = element('div', { className: 'final-grid' });
  const next = element('section', { className: 'report-card' });
  next.append(element('p', { className: 'card-kicker', text: t('report.nextSteps') }));
  appendTextList(next, report.recommendedNextSteps);

  const limits = element('section', { className: 'report-card' });
  limits.append(element('p', { className: 'card-kicker', text: t('report.limitations') }));
  appendTextList(limits, report.limitations);
  finalGrid.append(next, limits);
  reportRoot.append(finalGrid);

  reportSection.hidden = false;
  if (scroll) reportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setProgress(value, label) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  progressValue = bounded;
  progressPercent.textContent = `${bounded}%`;
  progressBar.style.width = `${bounded}%`;
  if (label) progressStage.textContent = label;
}

function clearProgressTimer() {
  if (progressTimer !== null) {
    window.clearInterval(progressTimer);
    progressTimer = null;
  }
}

function startProgress() {
  clearProgressTimer();
  searchProgress.hidden = false;
  progressStageIndex = 0;
  progressHoldTicks = 0;
  setProgress(1, t(PROGRESS_STAGES[0].key));

  progressTimer = window.setInterval(() => {
    const stage = PROGRESS_STAGES[progressStageIndex];
    if (progressValue < stage.target) {
      const distance = stage.target - progressValue;
      const increment = Math.max(1, Math.ceil(distance / 4));
      setProgress(Math.min(stage.target, progressValue + increment), t(stage.key));
      return;
    }

    if (progressStageIndex < PROGRESS_STAGES.length - 1) {
      progressHoldTicks += 1;
      if (progressHoldTicks >= 2) {
        progressStageIndex += 1;
        progressHoldTicks = 0;
        setProgress(progressValue, t(PROGRESS_STAGES[progressStageIndex].key));
      }
    }
  }, 300);
}

function completeProgress() {
  clearProgressTimer();
  setProgress(100, t('progress.ready'));
}

function failProgress() {
  clearProgressTimer();
  if (!searchProgress.hidden) progressStage.textContent = t('progress.stopped');
}

function setBusy(busy) {
  submitButton.disabled = busy;
  ideaInput.disabled = busy;
  exampleButton.disabled = busy;
  for (const chip of exampleChips) chip.disabled = busy;
  submitButton.replaceChildren(
    document.createTextNode(busy ? t('form.scanning') : t('form.submit')),
    document.createTextNode(busy ? '' : ' →'),
  );
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function clearError() {
  formError.textContent = '';
  formError.hidden = true;
}

function updateCharacterCount() {
  characterCount.textContent = `${ideaInput.value.length} / 5000`;
}

function useExample(text) {
  ideaInput.value = text;
  updateCharacterCount();
  ideaInput.focus();
}

ideaInput.addEventListener('input', updateCharacterCount);
exampleButton.addEventListener('click', () => useExample(t('example.idea.genAiTrust')));
for (const chip of exampleChips) {
  chip.addEventListener('click', () => useExample(t(`example.idea.${chip.dataset.exampleKey}`)));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const idea = ideaInput.value.trim();
  if (idea.length < 20) {
    showError(t('error.tooShort'));
    ideaInput.focus();
    return;
  }

  setBusy(true);
  startProgress();
  try {
    const response = await fetch(apiEndpoint('analyze-idea', '/api/analyze'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idea }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? t('error.analysis'));
    completeProgress();
    renderReport(payload.data ?? payload);
  } catch (error) {
    failProgress();
    showError(error instanceof Error ? error.message : t('error.analysis'));
  } finally {
    setBusy(false);
  }
});

function normalizeCorpus(payload) {
  const candidate = payload?.data?.stats ?? payload?.data ?? payload?.stats ?? payload ?? {};
  return {
    paperCount: candidate.paperCount ?? candidate.paper_count,
    papersWithAbstract: candidate.papersWithAbstract ?? candidate.papers_with_abstract,
    embeddedPaperCount: candidate.embeddedPaperCount ?? candidate.embedded_count,
    pendingEmbeddingCount: candidate.pendingEmbeddingCount ?? candidate.pending_embedding_count,
    ready: candidate.ready,
    conferences: asArray(candidate.conferences),
  };
}

function renderCorpusStatus(corpus, mode) {
  latestCorpus = corpus;
  latestCorpusMode = mode;
  const count = Number(corpus.paperCount);
  const abstracts = Number(corpus.papersWithAbstract);
  const conferenceParts = corpus.conferences.map((conference) => {
    if (typeof conference === 'string') return conference;
    const name = conference.name ?? conference.slug?.toUpperCase();
    const year = conference.year;
    const papers = Number(conference.papers);
    const label = [name, year].filter(Boolean).join(' ');
    return Number.isInteger(papers) ? `${label} · ${t('corpus.papers', { count: formatCount(papers) })}` : label;
  }).filter(Boolean);

  if (conferenceParts.length) {
    const abstractCount = Number.isInteger(abstracts) ? abstracts : count;
    corpusLedger.textContent = `${conferenceParts.join(' + ')}${Number.isInteger(abstractCount) ? ` = ${t('corpus.abstracts', { count: formatCount(abstractCount) })}` : ''}`;
  }

  const modeLabel = mode === 'live' ? t('corpus.live') : mode === 'mock' ? t('corpus.demo') : t('corpus.default');
  modeBadge.replaceChildren(
    element('span', { className: 'live-dot', attributes: { 'aria-hidden': 'true' } }),
    document.createTextNode(` ${modeLabel}${Number.isInteger(count) ? ` · ${t('corpus.papers', { count: formatCount(count) })}` : ''}`),
  );
}

async function loadCorpusStatus() {
  let corpus = {};
  let mode = edgeApiBase ? 'live' : undefined;

  try {
    const corpusResponse = await fetch(apiEndpoint('corpus-status', '/api/corpus'));
    if (corpusResponse.ok) corpus = normalizeCorpus(await corpusResponse.json());
  } catch {
    // Keep the page usable if corpus status is temporarily unavailable.
  }

  if (!edgeApiBase) {
    try {
      const healthResponse = await fetch('/api/health');
      if (healthResponse.ok) {
        const healthPayload = await healthResponse.json();
        mode = healthPayload.data?.mode ?? healthPayload.mode;
        if (!Number.isInteger(Number(corpus.paperCount))) {
          corpus = normalizeCorpus(healthPayload.data?.corpus ?? healthPayload.corpus ?? healthPayload);
        }
      }
    } catch {
      mode = undefined;
    }
  }

  renderCorpusStatus(corpus, mode);
}

applyStaticTranslations();
localeSelector.value = translator.locale;
localeSelector.addEventListener('change', () => setLocale(localeSelector.value));
initWorkspaceNavigation({
  sidebar: document.querySelector('#workspace-nav'),
  menuButton: document.querySelector('#workspace-menu-button'),
  authIntentHandler(intent) {
    const intentLabel = t(`auth.intent.${intent}`);
    authIntentStatus.textContent = t('auth.unavailable', { intent: intentLabel });
  },
});
updateCharacterCount();
loadCorpusStatus();
