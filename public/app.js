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
const corpusLedger = document.querySelector('#corpus-ledger');
const searchProgress = document.querySelector('#search-progress');
const progressBar = document.querySelector('#progress-bar');
const progressPercent = document.querySelector('#progress-percent');
const progressStage = document.querySelector('#progress-stage');

const EXAMPLE_IDEA =
  'I want to test whether AI literacy moderates the effect of generative-AI political messages on political trust among young adults, using a preregistered online experiment.';

const PROGRESS_STAGES = [
  { target: 5, label: 'Understanding the research question' },
  { target: 20, label: 'Reading corpus scope: APSA 2026 + ICA 2026' },
  { target: 35, label: 'Generating the query embedding' },
  { target: 55, label: 'Running Hybrid vector + full-text retrieval' },
  { target: 75, label: 'Ranking the most relevant papers' },
  { target: 90, label: 'Generating evidence-grounded analysis' },
  { target: 94, label: 'Finalizing grounded citations' },
];

let progressTimer = null;
let progressValue = 0;
let progressStageIndex = 0;
let progressHoldTicks = 0;

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
  const text = String(abstract ?? '').trim() || 'Abstract unavailable.';
  const preview = element('span', {
    className: 'paper-abstract-preview',
    attributes: { role: 'tooltip' },
  });
  preview.append(
    element('span', { className: 'paper-abstract-preview-label', text: 'Abstract' }),
    element('span', { className: 'paper-abstract-preview-text', text }),
  );
  if (sourceUrl) {
    preview.append(element('a', {
      className: 'paper-abstract-preview-source',
      text: 'Open original program ↗',
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
    text: paper.title ?? 'Untitled paper',
    attributes: {
      tabindex: '0',
      role: 'button',
      'aria-expanded': 'false',
      'aria-label': `Show abstract for ${paper.title ?? 'this paper'}`,
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

function renderRelatedPapers(items) {
  const papers = asArray(items)
    .slice()
    .sort((left, right) => Number(left.rank ?? Number.MAX_SAFE_INTEGER) - Number(right.rank ?? Number.MAX_SAFE_INTEGER));
  const section = element('section', { className: 'report-block' });
  const header = element('div', { className: 'section-heading related-heading' });
  header.append(element('p', { className: 'card-kicker', text: 'Ranked related papers' }));
  const countLabel = papers.length === 20 ? 'Top 20 Hybrid RRF results' : `${papers.length} ranked evidence records`;
  header.append(element('h3', { text: papers.length ? countLabel : 'No related paper returned' }));
  section.append(header);

  const methodNote = element('p', {
    className: 'ranking-note',
    text: 'Ordered by the database Hybrid RRF ranking (semantic vector + full-text search). Scores are ranking signals, not calibrated probabilities.',
  });
  section.append(methodNote);

  if (!papers.length) {
    section.append(element('p', {
      className: 'empty-state',
      text: 'No sufficiently direct evidence was returned from this corpus. Try a more compact formulation or adjacent terminology.',
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
      element('span', { className: 'paper-score-label', text: 'relevance score' }),
      element('strong', { className: 'paper-score', text: formatScore(paper.score) }),
    );

    const body = element('div', { className: 'paper-body' });
    const citationLine = element('div', { className: 'paper-citation-line' });
    citationLine.append(
      element('strong', { text: paper.authorYearLabel ?? 'Conference paper' }),
      element('span', { text: paper.conference ?? 'Conference record' }),
    );
    body.append(citationLine);
    body.append(createPaperTitlePreview(paper));

    const names = authorNames(paper.authors);
    if (names.length) body.append(element('p', { className: 'paper-authors', text: names.join(', ') }));

    const chips = element('div', { className: 'paper-detail-chips' });
    if (paper.division) chips.append(element('span', { text: paper.division }));
    for (const keyword of asArray(paper.keywords).slice(0, 8)) chips.append(element('span', { text: keyword }));
    if (chips.childElementCount) body.append(chips);

    body.append(element('p', { className: 'abstract-label', text: 'Abstract' }));
    body.append(element('p', { className: 'paper-abstract', text: paper.abstract ?? 'Abstract unavailable.' }));

    if (paper.sourceUrl) {
      body.append(element('a', {
        className: 'source-link',
        text: 'Original program ↗',
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

    const references = resolveEvidenceReferences(path, relatedPapers);
    if (references.length) {
      const grounding = element('div', { className: 'grounding-references' });
      grounding.append(element('span', { className: 'grounding-label', text: 'Grounded in' }));
      for (const reference of references) {
        const text = `${reference.authorYearLabel ?? 'Conference paper'} — ${reference.title ?? 'Untitled paper'}`;
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
            'aria-label': `Show abstract for ${reference.title ?? 'this paper'}`,
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

function renderReport(report) {
  clearElement(reportRoot);
  reportRoot.append(
    element('div', {
      className: 'coverage-notice',
      text: report.coverageNotice ?? 'This report is limited to the currently indexed conference corpus.',
    }),
    renderIdeaProfile(report.ideaProfile),
    renderRelatedPapers(report.relatedPapers),
    renderInnovationPaths(report.innovationPaths, report.relatedPapers),
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
  reportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  setProgress(1, PROGRESS_STAGES[0].label);

  progressTimer = window.setInterval(() => {
    const stage = PROGRESS_STAGES[progressStageIndex];
    if (progressValue < stage.target) {
      const distance = stage.target - progressValue;
      const increment = Math.max(1, Math.ceil(distance / 4));
      setProgress(Math.min(stage.target, progressValue + increment), stage.label);
      return;
    }

    if (progressStageIndex < PROGRESS_STAGES.length - 1) {
      progressHoldTicks += 1;
      if (progressHoldTicks >= 2) {
        progressStageIndex += 1;
        progressHoldTicks = 0;
        setProgress(progressValue, PROGRESS_STAGES[progressStageIndex].label);
      }
    }
  }, 300);
}

function completeProgress() {
  clearProgressTimer();
  setProgress(100, 'Report ready');
}

function failProgress() {
  clearProgressTimer();
  if (!searchProgress.hidden) progressStage.textContent = 'Scan stopped before completion';
}

function setBusy(busy) {
  submitButton.disabled = busy;
  ideaInput.disabled = busy;
  exampleButton.disabled = busy;
  for (const chip of exampleChips) chip.disabled = busy;
  submitButton.textContent = busy ? 'Scanning corpus…' : 'Start Testing →';
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
  startProgress();
  try {
    const response = await fetch(apiEndpoint('analyze-idea', '/api/analyze'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idea }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? 'The analysis could not be completed.');
    completeProgress();
    renderReport(payload.data ?? payload);
  } catch (error) {
    failProgress();
    showError(error instanceof Error ? error.message : 'The analysis could not be completed.');
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
  const count = Number(corpus.paperCount);
  const abstracts = Number(corpus.papersWithAbstract);
  const conferenceParts = corpus.conferences.map((conference) => {
    if (typeof conference === 'string') return conference;
    const name = conference.name ?? conference.slug?.toUpperCase();
    const year = conference.year;
    const papers = Number(conference.papers);
    const label = [name, year].filter(Boolean).join(' ');
    return Number.isInteger(papers) ? `${label} · ${formatCount(papers)} papers` : label;
  }).filter(Boolean);

  if (conferenceParts.length) {
    const abstractCount = Number.isInteger(abstracts) ? abstracts : count;
    corpusLedger.textContent = `${conferenceParts.join(' + ')}${Number.isInteger(abstractCount) ? ` = ${formatCount(abstractCount)} abstracts` : ''}`;
  }

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