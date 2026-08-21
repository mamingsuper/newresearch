const form = document.querySelector('#analysis-form');
const ideaInput = document.querySelector('#idea-input');
const submitButton = document.querySelector('#submit-button');
const exampleButton = document.querySelector('#example-button');
const formError = document.querySelector('#form-error');
const characterCount = document.querySelector('#character-count');
const reportSection = document.querySelector('#report-section');
const reportRoot = document.querySelector('#report-root');
const modeBadge = document.querySelector('#mode-badge');

const EXAMPLE_IDEA =
  'I want to test whether AI literacy moderates the effect of generative-AI political messages on political trust among young adults, using a preregistered online experiment.';

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

function appendTextList(parent, items, className = 'plain-list') {
  const list = element('ul', { className });
  for (const item of items) list.append(element('li', { text: item }));
  parent.append(list);
}

function renderIdeaProfile(profile) {
  const section = element('section', { className: 'report-card profile-card' });
  section.append(element('p', { className: 'card-kicker', text: 'Idea profile' }));
  section.append(element('h3', { text: profile.summary }));

  const facts = element('dl', { className: 'profile-grid' });
  const entries = [
    ['Topics', profile.topics.length ? profile.topics.join(', ') : 'Not yet resolved'],
    ['Population', profile.population ?? 'Not specified'],
    ['Method', profile.method ?? 'Not specified'],
    ['Mechanism', profile.mechanisms.length ? profile.mechanisms.join(', ') : 'Not specified'],
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
  const section = element('section', { className: 'report-block' });
  const header = element('div', { className: 'section-heading' });
  header.append(element('p', { className: 'card-kicker', text: 'Closest work' }));
  header.append(element('h3', { text: items.length ? `${items.length} evidence records` : 'No direct match returned' }));
  section.append(header);

  if (!items.length) {
    section.append(
      element('p', {
        className: 'empty-state',
        text: 'Try a more compact formulation or adjacent terminology, then broaden the search beyond this conference corpus.',
      }),
    );
    return section;
  }

  const grid = element('div', { className: 'evidence-grid' });
  for (const item of items) {
    const article = element('article', { className: 'evidence-card' });
    const meta = element('div', { className: 'evidence-meta' });
    meta.append(element('span', { text: item.conference }));
    meta.append(element('span', { text: item.relationship }));
    article.append(meta);
    article.append(element('h4', { text: item.title }));

    const dimensions = element('div', { className: 'chip-row', attributes: { 'aria-label': 'Overlap dimensions' } });
    for (const dimension of item.overlapDimensions) {
      dimensions.append(element('span', { className: 'chip', text: dimension }));
    }
    article.append(dimensions);
    article.append(element('blockquote', { text: item.evidence }));

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
    grid.append(article);
  }
  section.append(grid);
  return section;
}

function renderInnovationPaths(paths) {
  const section = element('section', { className: 'report-block' });
  const header = element('div', { className: 'section-heading' });
  header.append(element('p', { className: 'card-kicker', text: 'Innovation paths' }));
  header.append(element('h3', { text: 'Where the design may become more distinctive' }));
  section.append(header);

  const list = element('ol', { className: 'innovation-list' });
  for (const path of paths) {
    const item = element('li');
    const label = element('div', { className: 'inference-label', text: 'Model inference' });
    item.append(label);
    item.append(element('h4', { text: path.title }));
    item.append(element('p', { text: path.rationale }));
    if (path.evidencePaperIds.length) {
      item.append(
        element('small', {
          text: `Grounded in: ${path.evidencePaperIds.join(', ')}`,
        }),
      );
    }
    list.append(item);
  }
  section.append(list);
  return section;
}

function renderReport(report) {
  clearElement(reportRoot);
  reportRoot.append(
    element('div', { className: 'coverage-notice', text: report.coverageNotice }),
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
  reportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setBusy(busy) {
  submitButton.disabled = busy;
  ideaInput.disabled = busy;
  exampleButton.disabled = busy;
  submitButton.textContent = busy ? 'Mapping the frontier…' : 'Analyze the research frontier';
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

ideaInput.addEventListener('input', updateCharacterCount);
exampleButton.addEventListener('click', () => {
  ideaInput.value = EXAMPLE_IDEA;
  updateCharacterCount();
  ideaInput.focus();
});

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
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idea }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? 'The analysis could not be completed.');
    }
    renderReport(payload.data);
  } catch (error) {
    showError(error instanceof Error ? error.message : 'The analysis could not be completed.');
  } finally {
    setBusy(false);
  }
});

async function loadHealth() {
  try {
    const response = await fetch('/api/health');
    const payload = await response.json();
    const mode = payload.data?.mode === 'live' ? 'Live corpus' : 'Mock demo corpus';
    const count = payload.data?.corpus?.paperCount;
    modeBadge.textContent = Number.isInteger(count) ? `${mode} · ${count} records` : mode;
  } catch {
    modeBadge.textContent = 'Corpus status unavailable';
  }
}

updateCharacterCount();
loadHealth();
