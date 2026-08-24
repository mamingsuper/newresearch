import { createTranslator } from './i18n.js';
import { createWorkspaceUiState, initWorkspaceNavigation } from './workspace.js';
import { createCorpusStatusModel, normalizeCorpus, presentRenderedReport } from './workspace-behaviors.js';
import { createAuthClient } from './auth-client.js';
import { initAuthUi } from './auth-ui.js';
import { createAuthActionRouter } from './auth-actions.js';
import { initPublicAnalysisForm } from './analysis-form.js';
import { createOptimisticSavedPaperController, createSavedPaperStore, renderSavedPaperLibrary } from './saved-papers.js';
import { createConversationStore, renderConversationList } from './conversations.js';
import { downloadExport, exportConversation, exportPapers } from './exports.js';
import { createPrivateCacheGuard } from './private-cache-guard.js';
import { createProgramSubmissionController, initProgramSubmissionUi } from './program-submission.js';

const LOCALE_STORAGE_KEY = 'idea-radar-locale';
const readLocale = () => {
  try { return window.localStorage.getItem(LOCALE_STORAGE_KEY) ?? 'en'; } catch { return 'en'; }
};
let translator = createTranslator({ locale: readLocale() });
let t = translator.t;
const uiState = createWorkspaceUiState();

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
const accountEntry = document.querySelector('.account-entry');
const authDialog = document.querySelector('#auth-dialog');
const savedPapersSection = document.querySelector('#saved-papers');
const savedPapersRoot = document.querySelector('#saved-papers-root');
const savedPapersFilter = document.querySelector('#saved-papers-filter');
const savedPapersStatus = document.querySelector('#saved-papers-status');
const conversationsSection = document.querySelector('#conversations');
const conversationsRoot = document.querySelector('#conversations-root');
const conversationsStatus = document.querySelector('#conversations-status');
const saveAnalysisButton = document.querySelector('#save-analysis-button');
const saveAnalysisStatus = document.querySelector('#save-analysis-status');
const programSubmissionForm = document.querySelector('#program-submission-form');

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
let progressStageIndex = 0;
let progressHoldTicks = 0;
let latestCorpus = null;
let latestCorpusMode;
let latestReport = null;
let latestIdeaText = '';
let latestReportSaved = false;
let authState = { status: 'disabled', user: null };
let authUi;
let authActionRouter;
let savedPaperController;
let savedPaperStore;
let savedPaperItems = [];
let conversationStore;
let conversationItems = [];
let programSubmissionUi;
const privateCacheGuard = createPrivateCacheGuard();

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
  accountEntry.textContent = t(authState.status === 'authenticated' ? 'nav.account' : 'nav.signIn');
  authUi?.refresh();
  updateCharacterCount();
  renderUiState();
  if (latestCorpus) renderCorpusStatus(latestCorpus, latestCorpusMode);
  if (latestReport) renderReport(latestReport, { scroll: false, saved: latestReportSaved });
  if (!savedPapersSection.hidden) renderSavedLibrary();
  if (!conversationsSection.hidden) renderConversations();
  updatePaperActionButtons();
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

function formatScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score.toFixed(5) : '—';
}

function authorNames(authors) {
  return asArray(authors)
    .map((author) => author && typeof author === 'object' ? String(author.name ?? '').trim() : '')
    .filter(Boolean);
}

function requiresAccount(action, paperId, trigger = document.activeElement) {
  requestAccountAction(action, paperId, trigger);
}

function requestAccountAction(action, entityId = '', trigger = document.activeElement) {
  authActionRouter.route({
    action,
    entityId,
    returnHash: window.location.hash || '#new-analysis',
    trigger,
  });
}

async function restoreAuthenticatedIntent(intent) {
  await executeAuthenticatedIntent(intent);
  if (!['saved-papers', 'conversations', 'submit-program'].includes(intent.action) && intent.returnHash) window.location.hash = intent.returnHash;
  let target = null;
  if (intent.action === 'save-paper' && intent.entityId) {
    const card = [...document.querySelectorAll('[data-paper-id]')]
      .find((candidate) => candidate.dataset.paperId === intent.entityId);
    target = card?.querySelector('[data-paper-action="save"]') ?? null;
  } else {
    target = [...document.querySelectorAll('[data-auth-intent]')]
      .find((candidate) => candidate.dataset.authIntent === intent.action) ?? null;
  }
  target?.focus();
}

function announceExport(artifact, scope = 'global') {
  downloadExport(artifact);
  const message = t('export.completed', { count: artifact.recordCount ?? 1 });
  authIntentStatus.textContent = message;
  authIntentStatus.hidden = false;
  if (scope === 'saved') {
    savedPapersStatus.textContent = message;
    savedPapersStatus.hidden = false;
  }
  if (scope === 'conversation') {
    conversationsStatus.textContent = message;
    conversationsStatus.hidden = false;
  }
}

function exportSavedPaper(item, trigger = document.activeElement) {
  if (authState.status !== 'authenticated' || !privateCacheGuard.owns('saved', authState.user.id)) {
    requestAccountAction('export', `paper:${item.paperId}`, trigger);
    return false;
  }
  announceExport(exportPapers([item], 'bibtex'), 'saved');
  return true;
}

function exportSavedConversation(session, trigger = document.activeElement) {
  if (authState.status !== 'authenticated' || !privateCacheGuard.owns('conversations', authState.user.id)) {
    requestAccountAction('export', `conversation:${session.id}`, trigger);
    return false;
  }
  announceExport(exportConversation(session), 'conversation');
  return true;
}

function announceSaved(key, params = {}) {
  const message = t(key, params);
  savedPapersStatus.textContent = message;
  savedPapersStatus.hidden = false;
  authIntentStatus.textContent = message;
  authIntentStatus.hidden = false;
}

function savedErrorKey(code) {
  if (code === 'saved_papers_auth_required') return 'saved.error.auth';
  if (['saved_papers_invalid_paper', 'saved_papers_invalid_note', 'saved_papers_invalid_tags'].includes(code)) return 'saved.error.invalid';
  return 'saved.error.unavailable';
}

function updatePaperActionButtons() {
  if (!savedPaperController) return;
  for (const button of document.querySelectorAll('[data-paper-action="save"]')) {
    const paperId = button.closest('[data-paper-id]')?.dataset.paperId ?? '';
    const pending = savedPaperController.isPending(paperId);
    const saved = savedPaperController.isSaved(paperId);
    button.disabled = pending;
    button.setAttribute('aria-pressed', String(saved));
    button.textContent = t(pending ? 'saved.saving' : saved ? 'saved.savedButton' : 'report.savePaper');
  }
}

function buildSavedPaperController(ownerId = null) {
  return createOptimisticSavedPaperController({
    store: savedPaperStore,
    onChange: updatePaperActionButtons,
    onError(code) {
      if (ownerId && privateCacheGuard.isActive(ownerId)) announceSaved(savedErrorKey(code));
    },
  });
}

function renderSavedLibrary() {
  renderSavedPaperLibrary({
    root: savedPapersRoot,
    items: savedPaperItems,
    query: savedPapersFilter.value,
    t,
    async onRemove(paperId) {
      const ownerId = authState.user?.id ?? null;
      const ownerController = savedPaperController;
      const removed = await ownerController.remove(paperId);
      if (!privateCacheGuard.owns('saved', ownerId)) return;
      if (!removed) return;
      savedPaperItems = savedPaperItems.filter((item) => item.paperId !== paperId);
      renderSavedLibrary();
      announceSaved('saved.removed');
    },
    onExport(item) { exportSavedPaper(item); },
    async onUpdateNote(paperId, values) {
      const ownerId = authState.user?.id ?? null;
      try {
        await savedPaperStore.updateNote(paperId, values);
        if (!privateCacheGuard.owns('saved', ownerId)) return;
        savedPaperItems = savedPaperItems.map((item) => item.paperId === paperId ? { ...item, ...values } : item);
        renderSavedLibrary();
        announceSaved('saved.updated');
      } catch (error) {
        if (!privateCacheGuard.owns('saved', ownerId)) return;
        announceSaved(savedErrorKey(error?.code));
      }
    },
  });
}

async function loadSavedLibrary() {
  const ownerId = authState.user?.id ?? null;
  savedPapersSection.hidden = false;
  window.location.hash = '#saved-papers';
  announceSaved('saved.loading');
  try {
    const items = await savedPaperStore.list();
    if (!privateCacheGuard.mark('saved', ownerId)) return;
    savedPaperItems = items;
    savedPaperController.replace(savedPaperItems);
    renderSavedLibrary();
    announceSaved('saved.loaded', { count: savedPaperItems.length });
    savedPapersFilter.focus();
  } catch (error) {
    if (!privateCacheGuard.isActive(ownerId)) return;
    savedPaperItems = [];
    savedPaperController.replace([]);
    renderSavedLibrary();
    announceSaved(savedErrorKey(error?.code));
  }
}

function conversationErrorKey(code) {
  if (code === 'conversations_auth_required') return 'conversation.error.auth';
  if (code === 'conversations_invalid') return 'conversation.error.invalid';
  return 'conversation.error.unavailable';
}

function announceConversation(key) {
  const message = t(key);
  conversationsStatus.textContent = message;
  conversationsStatus.hidden = false;
  authIntentStatus.textContent = message;
  authIntentStatus.hidden = false;
}

function renderConversations() {
  renderConversationList({
    root: conversationsRoot,
    sessions: conversationItems,
    t: (key) => t(key),
    async onReopen(sessionId) {
      const ownerId = authState.user?.id ?? null;
      try {
        const session = await conversationStore.reopen(sessionId);
        if (!privateCacheGuard.mark('report', ownerId)) return;
        latestIdeaText = session.ideaText;
        latestReportSaved = true;
        ideaInput.value = session.ideaText;
        updateCharacterCount();
        renderReport(session.report, { saved: true });
        announceConversation('conversation.reopened');
      } catch (error) {
        if (!privateCacheGuard.isActive(ownerId)) return;
        announceConversation(conversationErrorKey(error?.code));
      }
    },
    async onRename(session) {
      const ownerId = authState.user?.id ?? null;
      const title = window.prompt(t('conversation.renamePrompt'), session.title);
      if (title === null) return;
      try {
        await conversationStore.rename(session.id, title);
        if (!privateCacheGuard.owns('conversations', ownerId)) return;
        conversationItems = conversationItems.map((item) => item.id === session.id ? { ...item, title: title.trim() } : item);
        renderConversations();
        announceConversation('conversation.renamed');
      } catch (error) {
        if (!privateCacheGuard.owns('conversations', ownerId)) return;
        announceConversation(conversationErrorKey(error?.code));
      }
    },
    onExport(session) { exportSavedConversation(session); },
    async onDelete(sessionId) {
      const ownerId = authState.user?.id ?? null;
      if (!window.confirm(t('conversation.deleteConfirm'))) return;
      try {
        await conversationStore.remove(sessionId);
        if (!privateCacheGuard.owns('conversations', ownerId)) return;
        conversationItems = conversationItems.filter((item) => item.id !== sessionId);
        renderConversations();
        announceConversation('conversation.deleted');
      } catch (error) {
        if (!privateCacheGuard.owns('conversations', ownerId)) return;
        announceConversation(conversationErrorKey(error?.code));
      }
    },
  });
}

async function loadConversations() {
  const ownerId = authState.user?.id ?? null;
  conversationsSection.hidden = false;
  window.location.hash = '#conversations';
  announceConversation('conversation.loading');
  try {
    const items = await conversationStore.list();
    if (!privateCacheGuard.mark('conversations', ownerId)) return;
    conversationItems = items;
    renderConversations();
    announceConversation('conversation.loaded');
    conversationsSection.focus?.();
  } catch (error) {
    if (!privateCacheGuard.isActive(ownerId)) return;
    conversationItems = [];
    renderConversations();
    announceConversation(conversationErrorKey(error?.code));
  }
}

async function saveLatestAnalysis() {
  if (!latestReport || !latestIdeaText) return false;
  saveAnalysisButton.disabled = true;
  saveAnalysisButton.textContent = t('conversation.saving');
  saveAnalysisStatus.textContent = t('conversation.saving');
  try {
    await conversationStore.save({
      title: String(latestReport.ideaProfile?.summary ?? latestIdeaText).trim().slice(0, 200),
      ideaText: latestIdeaText,
      report: latestReport,
      language: translator.locale,
      corpusSnapshot: latestCorpus ?? {},
    });
    latestReportSaved = true;
    saveAnalysisButton.textContent = t('conversation.saved');
    saveAnalysisStatus.textContent = t('conversation.savedStatus');
    return true;
  } catch (error) {
    saveAnalysisButton.disabled = false;
    saveAnalysisButton.textContent = t('conversation.save');
    saveAnalysisStatus.textContent = t(conversationErrorKey(error?.code));
    return false;
  }
}

async function executeAuthenticatedIntent(intent = {}) {
  if (intent.action === 'save-paper') {
    const ownerId = authState.user?.id ?? null;
    const ownerController = savedPaperController;
    const saved = await ownerController.save(intent.entityId);
    if (!privateCacheGuard.isActive(ownerId)) return false;
    if (saved) announceSaved('saved.saved');
    return saved;
  }
  if (intent.action === 'saved-papers') {
    await loadSavedLibrary();
    return true;
  }
  if (intent.action === 'save-analysis') return saveLatestAnalysis();
  if (intent.action === 'conversations') {
    await loadConversations();
    return true;
  }
  if (intent.action === 'submit-program') {
    window.location.hash = '#submit-program';
    programSubmissionUi?.focus();
    return true;
  }
  if (intent.action === 'export') {
    const [kind, entityId] = String(intent.entityId ?? '').split(':');
    if (kind === 'paper') {
      if (!privateCacheGuard.owns('saved', authState.user.id)) {
        const ownerId = authState.user.id;
        const items = await savedPaperStore.list();
        if (!privateCacheGuard.mark('saved', ownerId)) return false;
        savedPaperItems = items;
      }
      const item = savedPaperItems.find((candidate) => candidate.paperId === entityId);
      return item ? exportSavedPaper(item) : false;
    }
    if (kind === 'conversation') {
      if (!privateCacheGuard.owns('conversations', authState.user.id)) {
        const ownerId = authState.user.id;
        const items = await conversationStore.list();
        if (!privateCacheGuard.mark('conversations', ownerId)) return false;
        conversationItems = items;
      }
      const session = conversationItems.find((candidate) => candidate.id === entityId);
      return session ? exportSavedConversation(session) : false;
    }
  }
  return false;
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
    rankColumn.append(element('span', { className: 'paper-rank-number', text: `#${String(rank).padStart(2, '0')}` }));

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

    body.append(element('p', { className: 'abstract-label', text: t('report.abstract') }));
    body.append(element('p', { className: 'paper-abstract', text: paper.abstract ?? t('report.abstractUnavailable') }));

    const metaRow = element('div', { className: 'paper-meta-row' });
    metaRow.append(element('span', {
      className: 'paper-meta-score',
      text: `${t('report.relevance')}: ${formatScore(paper.score)}`,
    }));
    if (paper.division) metaRow.append(element('span', { className: 'paper-meta-chip', text: paper.division }));
    for (const keyword of asArray(paper.keywords).slice(0, 8)) {
      metaRow.append(element('span', { className: 'paper-meta-chip', text: keyword }));
    }
    if (paper.sourceUrl) {
      metaRow.append(element('a', {
        className: 'source-link',
        text: t('report.originalProgram'),
        attributes: {
          href: paper.sourceUrl,
          target: '_blank',
          rel: 'noreferrer noopener',
        },
      }));
    }
    body.append(metaRow);

    const actions = element('div', { className: 'paper-actions' });
    const title = paper.title ?? t('report.thisPaper');
    const saveButton = element('button', {
      text: t('report.savePaper'),
      attributes: {
        type: 'button',
        'data-paper-action': 'save',
        'aria-pressed': 'false',
        'aria-label': t('report.savePaperFor', { title }),
      },
    });
    saveButton.addEventListener('click', (event) => {
      event.currentTarget.focus();
      requiresAccount('save-paper', paper.paperId);
    });
    const exportButton = element('button', {
      text: t('report.exportCitation'),
      attributes: {
        type: 'button',
        'data-export-format': 'bibtex',
        'aria-label': t('report.exportCitationFor', { title }),
      },
    });
    exportButton.addEventListener('click', () => announceExport(exportPapers([paper], 'bibtex')));
    actions.append(saveButton, exportButton);
    body.append(actions);

    article.append(rankColumn, body);
    list.append(article);
  }
  section.append(list);
  queueMicrotask(updatePaperActionButtons);
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

function renderReport(report, { scroll = true, saved = latestReportSaved } = {}) {
  latestReport = report;
  latestReportSaved = saved;
  saveAnalysisButton.hidden = false;
  saveAnalysisButton.disabled = saved;
  saveAnalysisButton.textContent = t(saved ? 'conversation.saved' : 'conversation.save');
  saveAnalysisStatus.textContent = saved ? t('conversation.savedStatus') : '';
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

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  presentRenderedReport(reportSection, { scroll, prefersReducedMotion });
}

function renderUiState() {
  const view = uiState.view(t);
  submitButton.disabled = view.busy;
  ideaInput.disabled = view.busy;
  exampleButton.disabled = view.busy;
  for (const chip of exampleChips) chip.disabled = view.busy;
  submitButton.replaceChildren(
    document.createTextNode(view.submitLabel),
    document.createTextNode(view.busy ? '' : ' →'),
  );
  searchProgress.hidden = view.progress.hidden;
  progressPercent.textContent = `${view.progress.value}%`;
  progressBar.style.width = `${view.progress.value}%`;
  progressStage.textContent = view.progress.label;
  formError.textContent = view.error;
  formError.hidden = !view.error;
  authIntentStatus.textContent = view.auth;
  authIntentStatus.hidden = !view.auth;
}

function setProgress(value, key, { hidden } = {}) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  uiState.setProgress({ value: bounded, key, hidden });
  renderUiState();
}

function clearProgressTimer() {
  if (progressTimer !== null) {
    window.clearInterval(progressTimer);
    progressTimer = null;
  }
}

function startProgress() {
  clearProgressTimer();
  progressStageIndex = 0;
  progressHoldTicks = 0;
  setProgress(1, PROGRESS_STAGES[0].key, { hidden: false });

  progressTimer = window.setInterval(() => {
    const stage = PROGRESS_STAGES[progressStageIndex];
    const progress = uiState.progress();
    if (progress.value < stage.target) {
      const distance = stage.target - progress.value;
      const increment = Math.max(1, Math.ceil(distance / 4));
      setProgress(Math.min(stage.target, progress.value + increment), stage.key);
      return;
    }

    if (progressStageIndex < PROGRESS_STAGES.length - 1) {
      progressHoldTicks += 1;
      if (progressHoldTicks >= 2) {
        progressStageIndex += 1;
        progressHoldTicks = 0;
        setProgress(progress.value, PROGRESS_STAGES[progressStageIndex].key);
      }
    }
  }, 300);
}

function completeProgress() {
  clearProgressTimer();
  setProgress(100, 'progress.ready', { hidden: false });
}

function failProgress() {
  clearProgressTimer();
  const progress = uiState.progress();
  if (!progress.hidden) setProgress(progress.value, 'progress.stopped');
}

function setBusy(busy) {
  uiState.setBusy(busy);
  renderUiState();
}

function showError(key, params) {
  uiState.setError(key, params);
  renderUiState();
}

function clearError() {
  uiState.clearError();
  renderUiState();
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

function renderCorpusStatus(corpus, mode) {
  const model = createCorpusStatusModel(corpus, mode, t);
  latestCorpus = model.corpus;
  latestCorpusMode = mode;
  if (model.ledgerText) corpusLedger.textContent = model.ledgerText;
  modeBadge.replaceChildren(
    element('span', { className: 'live-dot', attributes: { 'aria-hidden': 'true' } }),
    document.createTextNode(` ${model.modeText}`),
  );
}

async function loadCorpusStatus() {
  let corpus = normalizeCorpus({});
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
const publicConfig = window.__IDEA_RADAR_CONFIG__ ?? {};
let authStorage = null;
try { authStorage = window.localStorage; } catch { /* Auth remains disabled without browser storage. */ }
const authClient = createAuthClient({
  sdk: window.supabase,
  url: publicConfig.supabaseUrl ?? '',
  publishableKey: publicConfig.supabasePublishableKey ?? '',
  storage: authStorage,
});
const browserSupabase = authClient.getSupabaseClient();
async function currentAccessToken() {
  const result = await browserSupabase?.auth?.getSession?.();
  if (result?.error) return null;
  return result?.data?.session?.access_token ?? null;
}
savedPaperStore = createSavedPaperStore({
  supabase: browserSupabase,
  getUserId: () => authState.user?.id ?? null,
});
conversationStore = createConversationStore({
  fetchImpl: window.fetch.bind(window),
  endpoint: apiEndpoint('save-analysis', '/api/save-analysis'),
  getAccessToken: currentAccessToken,
  randomUUID: () => window.crypto.randomUUID(),
  supabase: browserSupabase,
  getUserId: () => authState.user?.id ?? null,
});
savedPaperController = buildSavedPaperController();
authUi = initAuthUi({
  authClient,
  dialog: authDialog,
  redirectTo: new URL('./', window.location.href).href,
  t: (key) => t(key),
  onSessionChange(state) {
    const cacheTransition = privateCacheGuard.transition(state.user?.id ?? null);
    authState = state;
    accountEntry.dataset.authState = state.status;
    accountEntry.textContent = t(state.status === 'authenticated' ? 'nav.account' : 'nav.signIn');
    if (cacheTransition.userChanged) {
      savedPaperItems = [];
      savedPaperController = buildSavedPaperController(state.user?.id ?? null);
      savedPapersSection.hidden = true;
      clearElement(savedPapersRoot);
      conversationItems = [];
      conversationsSection.hidden = true;
      clearElement(conversationsRoot);
      if (cacheTransition.clearPrivateReport) {
        latestReport = null;
        latestIdeaText = '';
        latestReportSaved = false;
        ideaInput.value = '';
        updateCharacterCount();
        clearElement(reportRoot);
        reportSection.hidden = true;
        saveAnalysisButton.hidden = true;
        saveAnalysisButton.disabled = false;
        saveAnalysisStatus.textContent = '';
      }
    }
  },
  consumeIntent(intent) {
    return restoreAuthenticatedIntent(intent);
  },
});
authActionRouter = createAuthActionRouter({
  getAuthState: () => authState,
  openAuth: (intent) => authUi.open(intent),
  dispatchIntent(intent) {
    void executeAuthenticatedIntent(intent);
    window.dispatchEvent(new CustomEvent('idea-radar:auth-intent', { detail: intent }));
  },
  onUnavailable(action) {
    uiState.setAuthIntent(action);
    renderUiState();
  },
});
if (programSubmissionForm) {
  const programController = createProgramSubmissionController({
    auth: { getUserId: () => authState.user?.id ?? null, getAccessToken: currentAccessToken },
    storage: {
      async upload({ path, file, mimeType, onProgress }) {
        if (!browserSupabase) throw new Error('storage_unavailable');
        const { error } = await browserSupabase.storage.from('program-submissions').upload(path, file, {
          contentType: mimeType,
          upsert: false,
        });
        if (error) throw error;
        onProgress?.(100);
      },
      async remove(path) {
        if (!browserSupabase) throw new Error('storage_unavailable');
        const { error } = await browserSupabase.storage.from('program-submissions').remove([path]);
        if (error) throw error;
      },
    },
    api: {
      async submit(payload, { accessToken }) {
        const response = await fetch(apiEndpoint('submit-program', '/api/submit-program'), {
          method: 'POST',
          headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error?.code ?? 'submit_failed');
        return body.data;
      },
    },
    draftStorage: authStorage,
  });
  programSubmissionUi = initProgramSubmissionUi({
    form: programSubmissionForm,
    controller: programController,
    getAuthState: () => authState,
    onRequireAuth: (trigger) => requestAccountAction('submit-program', '', trigger),
    t: (key, params) => t(key, params),
  });
}
initPublicAnalysisForm({
  form,
  readIdea: () => ideaInput.value,
  onReset: clearError,
  onInvalid() {
    showError('error.tooShort');
    ideaInput.focus();
  },
  onStart() {
    setBusy(true);
    startProgress();
  },
  analyze: (idea) => authActionRouter.runPublicAnalysis(() => (
    fetch(apiEndpoint('analyze-idea', '/api/analyze'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idea }),
    })
  )),
  onSuccess(report) {
    completeProgress();
    privateCacheGuard.clear('report');
    latestIdeaText = ideaInput.value.trim();
    latestReportSaved = false;
    renderReport(report, { saved: false });
  },
  onFailure() {
    failProgress();
    showError('error.analysis');
  },
  onFinish() { setBusy(false); },
});
initWorkspaceNavigation({
  sidebar: document.querySelector('#workspace-nav'),
  menuButton: document.querySelector('#workspace-menu-button'),
  authIntentHandler(intent, event) {
    const trigger = event.target.closest('[data-auth-intent]');
    queueMicrotask(() => requestAccountAction(intent, '', trigger));
  },
});
savedPapersFilter.addEventListener('input', renderSavedLibrary);
saveAnalysisButton.addEventListener('click', (event) => {
  event.currentTarget.focus();
  requestAccountAction('save-analysis', '', event.currentTarget);
});
renderUiState();
updateCharacterCount();
loadCorpusStatus();
