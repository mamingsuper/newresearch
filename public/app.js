const form = document.querySelector('#analysis-form');
const ideaInput = document.querySelector('#idea-input');
const submitButton = document.querySelector('#submit-button');
const exampleButton = document.querySelector('#example-button');
const exampleChips = [...document.querySelectorAll('[data-example]')];
const formError = document.querySelector('#form-error');
const characterCount = document.querySelector('#character-count');
const reportSection = document.querySelector('#report-section');
const reportRoot = document.querySelector('#report-root');
const modeBadge = document.querySelector('#mode-badge');
const corpusPaperCount = document.querySelector('#corpus-paper-count');
const corpusVectorStatus = document.querySelector('#corpus-vector-status');
const corpusSummary = document.querySelector('#corpus-summary');
const workbenchState = document.querySelector('#workbench-state');

const EXAMPLE_IDEA =
  'I want to test whether AI literacy moderates the effect of generative-AI political messages on political trust among young adults, using a preregistered online experiment.';

const configuredApiBase = window.__IDEA_RADAR_CONFIG__?.apiBaseUrl?.trim();
const edgeApiBase = window.location.hostname === 'mamingsuper.github.io' && configuredApiBase
  ? configuredApiBase.replace(/\/$/, '')
  : '';

function apiEndpoint(edgePath, localPath) {
  return edgeApiBase ? `${edgeApiBase}/${edgePath}` : localPath;
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

function appendTextList(parent, items, className = 'plain-list') {
  const list = element('ul', { className });
  for (const item of asArray(items)) list.append(element('li', { text: item }));
  parent.append(list);
}

function renderIdeaProfile(profile = {}) {
  const section = element('section', { className: 'report-card profile-card' });
  section.append(element('p', { className: 'card-kicker', text: 'Idea profile' }));
  section.append(element('h3', { text: profile.summary ?? 'The idea profile could not be resolved.' }));

  const facts = element('dl', { className: 'profile-grid' });
  const entries = [
    ['Topics', asArray(profile.topics).length ? profile.topics.join(', ') : 'Not yet resolved'],
    ['Population', profile.population ?? 'Not specified'],
    ['Method', profile.method ?? 'Not specified'],
    ['Mechanism', asArray(profile.mechanisms).length ? profile.mechanisms.join(', ') : 'Not specified'],
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

function renderClosestWork(items) {
  const evidenceItems = asArray(items);
  const section = element('section', { className: 'report-block' });
  const header = element('div', { className: 'section-heading' });
  header.append(element('p', { className: 'card-kicker', text: 'Related papers' }));
  header.append(element('h3', { text: evidenceItems.length ? `${evidenceItems.length} evidence records` : 'No direct match returned' }));
  section.append(header);

  if (!evidenceItems.length) {
    section.append(
      element('p', {
        className: 'empty-state',
        text: 'No sufficiently direct evidence was returned from this corpus. Try a more compact formulation or adjacent terminology.',
      }),
    );
    return section;
  }

  const grid = element('div', { className: 'evidence-grid' });
  evidenceItems.forEach((item, index) => {
    const article = element('article', { className: 'evidence-card' });
    article.append(element('span', { className: 'evidence-number', text: String(index + 1).padStart(2, '0') }));
    const meta = element('div', { className: 'evidence-meta' });
    meta.append(element('span', { text: item.conference ?? 'Conference record' }));
    meta.append(element('span', { text: item.relationship ?? 'Related evidence' }));
    article.append(meta);
    article.append(element('h4', { text: item.title ?? 'Untitled paper' }));

    const dimensions = element('div', { className: 'chip-row', attributes: { 'aria-label': 'Overlap dimensions' } });
    for (const dimension of asArray(item.overlapDimensions)) {
      dimensions.append(element('span', { className: 'chip', text: dimension }));
    }
    if (dimensions.childElementCount) article.append(dimensions);
    if (item.evidence) article.append(element('blockquote', { text: item.evidence }));

    if (item.sourceUrl) {
      const link = element('a', {
        className: 'source-link',
        text: 'Original program ↗',
        attributes: {
          href: item.sourceUrl,
          target: '_blank',
          rel: 'noreferrer noopener',
        },
      });
      article.append(link);
    }
    grid.append(article);
  });
  section.append(grid);
  return section;
}

function renderInnovationPaths(paths) {
  const pathItems = asArray(paths);
  const section = element('section', { className: 'report-block' });
  const header = element('div', { className: 'section-heading' });
  header.append(element('p', { className: 'card-kicker', text: 'Innovation directions' }));
  header.append(element('h3', { text: pathItems.length ? 'Where the design may become more distinctive' : 'No grounded direction returned' }));
  section.append(header);

  if (!pathItems.length) {
    section.append(element('p', { className: 'empty-state', text: 'The available evidence was not strong enough to support a differentiation path.' }));
    return section;
  }

  const list = element('ol', { className: 'innovation-list' });
  for (const path of pathItems) {
    const item = element('li');
    item.append(element('div', { className: 'inference-label', text: 'Evidence-linked inference' }));
    item.append(element('h4', { text: path.title ?? 'Research direction' }));
    item.append(element('p', { text: path.rationale ?? '' }));
    const grounding = asArray(path.evidencePaperTitles).length
      ? path.evidencePaperTitles
      : asArray(path.evidencePaperIds);
    if (grounding.length) item.append(element('small', { text: `Grounded in: ${grounding.join(', ')}` }));
    list.append(item);
  }
  section.append(list);
  return section;
}

function renderReport(report) {
  clearElement(reportRoot);
  reportRoot.append(
    element('div', {
      className: 'coverage-notice',
      text: report.coverageNotice ?? 'This report is limited to the currently indexed conference corpus.',
    }),
    renderIdeaProfile(report.ideaProfile),
    renderClosestWork(report.closestWork),
    renderInnovationPaths(report.innovationPaths),
  );

  const finalGrid = element('div', { className: 'final-grid' });
  const next = element('section', { className: 'report-card' });
  next.append(element('p', { className: 'card-kicker', text: 'Recommended next steps' }));
  appendTextList(next, report.recommendedNextSteps);

  const limits = element('section', { className: 'report-card' });
  limits.append(element('p', { className: 'card-kicker', text: 'Limitations' }));
  appendTextList(limits, report.limitations);
  finalGrid.append(next, limits);
  reportRoot.append(finalGrid);

  reportSection.hidden = false;
  workbenchState.textContent = 'Report ready';
  reportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setBusy(busy) {
  submitButton.disabled = busy;
  ideaInput.disabled = busy;
  exampleButton.disabled = busy;
  for (const chip of exampleChips) chip.disabled = busy;
  submitButton.textContent = busy ? 'Scanning corpus…' : 'Start Testing →';
  if (busy) workbenchState.textContent = 'Analyzing…';
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
  workbenchState.textContent = 'Needs input';
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
exampleButton.addEventListener('click', () => useExample(EXAMPLE_IDEA));
for (const chip of exampleChips) {
  chip.addEventListener('click', () => useExample(chip.dataset.example));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const idea = ideaInput.value.trim();
  if (idea.length < 20) {
    showError('Please describe the idea in at least 20 characters.');
    ideaInput.focus();
    return;
  }

  setBusy(true);
  try {
    const response = await fetch(apiEndpoint('analyze-idea', '/api/analyze'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idea }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? 'The analysis could not be completed.');
    renderReport(payload.data ?? payload);
  } catch (error) {
    showError(error instanceof Error ? error.message : 'The analysis could not be completed.');
  } finally {
    setBusy(false);
  }
});

function normalizeCorpus(payload) {
  const candidate = payload?.data?.stats ?? payload?.data ?? payload?.stats ?? payload ?? {};
  return {
    paperCount: candidate.paperCount ?? candidate.paper_count,
    embeddedPaperCount: candidate.embeddedPaperCount ?? candidate.embedded_count,
    pendingEmbeddingCount: candidate.pendingEmbeddingCount ?? candidate.pending_embedding_count,
    ready: candidate.ready,
    conferences: asArray(candidate.conferences),
  };
}

function renderCorpusStatus(corpus, mode) {
  const count = Number(corpus.paperCount);
  corpusPaperCount.textContent = Number.isInteger(count) ? formatCount(count) : '—';

  const embedded = Number(corpus.embeddedPaperCount);
  const pending = Number(corpus.pendingEmbeddingCount);
  if (corpus.ready === true || (Number.isInteger(count) && count > 0 && embedded === count)) {
    corpusVectorStatus.textContent = Number.isInteger(embedded) ? `${formatCount(embedded)} ready` : 'ready';
  } else if (Number.isInteger(pending) && pending > 0) {
    corpusVectorStatus.textContent = `${formatCount(pending)} pending`;
  } else {
    corpusVectorStatus.textContent = 'status unavailable';
  }

  const labels = corpus.conferences.map((conference) => {
    if (typeof conference === 'string') return conference;
    const name = conference.name ?? conference.slug?.toUpperCase();
    const year = conference.year;
    return [name, year].filter(Boolean).join(' ');
  }).filter(Boolean);
  corpusSummary.textContent = labels.length
    ? `${labels.join(' · ')}. Corpus-scoped retrieval; no global novelty claim.`
    : 'Corpus-scoped retrieval; no global novelty claim.';

  const modeLabel = mode === 'live' ? 'Live corpus' : mode === 'mock' ? 'Demo corpus' : 'Corpus';
  modeBadge.replaceChildren(
    element('span', { className: 'live-dot', attributes: { 'aria-hidden': 'true' } }),
    document.createTextNode(` ${modeLabel}${Number.isInteger(count) ? ` · ${formatCount(count)} papers` : ''}`),
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

updateCharacterCount();
loadCorpusStatus();
