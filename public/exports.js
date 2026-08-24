const PAPER_FIELDS = Object.freeze([
  'title', 'authors', 'abstract', 'conference', 'year', 'division', 'keywords', 'sourceUrl', 'note', 'tags',
]);

function cleanText(value, maxLength = 20000) {
  return typeof value === 'string' ? value.replaceAll('\u0000', '').trim().slice(0, maxLength) : '';
}

function cleanList(value, maxItems = 50, maxLength = 500) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => cleanText(item, maxLength)).filter(Boolean);
}

function authorNames(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((author) => {
    if (typeof author === 'string') return cleanText(author, 500);
    return cleanText(author?.name, 500);
  }).filter(Boolean);
}

function httpUrl(value) {
  try {
    const url = new URL(typeof value === 'string' ? value : '');
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function canonicalPaper(value = {}) {
  const yearValue = value.conferenceYear ?? value.conference_year ?? value.year;
  const year = Number.isInteger(Number(yearValue)) && Number(yearValue) >= 1000 && Number(yearValue) <= 9999
    ? String(Number(yearValue))
    : '';
  const item = {
    title: cleanText(value.title, 2000),
    authors: authorNames(value.authors),
    abstract: cleanText(value.abstract, 30000),
    conference: cleanText(value.conferenceName ?? value.conference_name ?? value.conference, 1000),
    year,
    division: cleanText(value.division, 1000),
    keywords: cleanList(value.keywords, 100, 200),
    sourceUrl: httpUrl(value.sourceUrl ?? value.source_url),
    note: cleanText(value.note, 4000),
    tags: cleanList(value.tags, 20, 64),
  };
  return Object.fromEntries(PAPER_FIELDS.map((field) => [field, item[field]]));
}

function spreadsheetSafe(value) {
  const text = String(value ?? '');
  return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  return `"${spreadsheetSafe(value).replaceAll('"', '""')}"`;
}

function csvExport(papers) {
  const header = ['title', 'authors', 'abstract', 'conference', 'year', 'division', 'keywords', 'source_url', 'note', 'tags'];
  const rows = papers.map((paper) => [
    paper.title,
    paper.authors.join('; '),
    paper.abstract,
    paper.conference,
    paper.year,
    paper.division,
    paper.keywords.join('; '),
    paper.sourceUrl,
    paper.note,
    paper.tags.join('; '),
  ].map(csvCell).join(','));
  return `${header.join(',')}\r\n${rows.join('\r\n')}${rows.length ? '\r\n' : ''}`;
}

function asciiSlug(value, fallback = 'paper') {
  const slug = cleanText(value, 500)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function authorSurname(authors) {
  const first = authors[0] ?? '';
  const commaName = first.split(',')[0]?.trim();
  if (first.includes(',') && commaName) return commaName;
  const parts = first.trim().split(/\s+/);
  return parts.at(-1) ?? '';
}

function bibtexEscape(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\textbackslash{}')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}')
    .replaceAll('&', '\\&')
    .replaceAll('%', '\\%')
    .replaceAll('#', '\\#')
    .replaceAll('_', '\\_')
    .replaceAll('$', '\\$');
}

function bibtexExport(papers) {
  const usedKeys = new Map();
  return papers.map((paper) => {
    const titleWord = asciiSlug(paper.title, 'paper').split('-')[0];
    const base = `${asciiSlug(authorSurname(paper.authors), 'anon').replaceAll('-', '')}${paper.year || 'nd'}${titleWord}`;
    const occurrence = (usedKeys.get(base) ?? 0) + 1;
    usedKeys.set(base, occurrence);
    const key = occurrence === 1 ? base : `${base}${occurrence}`;
    const fields = [
      ['title', paper.title],
      ['author', paper.authors.join(' and ')],
      ['booktitle', paper.conference],
      ['year', paper.year],
      ['abstract', paper.abstract],
      ['keywords', paper.keywords.join(', ')],
      ['url', paper.sourceUrl],
    ].filter(([, value]) => value);
    return `@inproceedings{${key},\n${fields.map(([name, value]) => `  ${name} = {${bibtexEscape(value)}}`).join(',\n')}\n}`;
  }).join('\n\n') + (papers.length ? '\n' : '');
}

function markdownText(value) {
  return String(value ?? '').replace(/([\\`*_[\]<>])/g, '\\$1').replace(/([()])/g, '\\$1');
}

function markdownPaper(paper, index, { headingLevel = 2 } = {}) {
  const title = markdownText(paper.title || `Paper ${index + 1}`);
  const lines = [
    `${'#'.repeat(headingLevel)} ${title}`,
    '',
  ];
  const citation = [paper.authors.join(', '), paper.conference, paper.year].filter(Boolean).map(markdownText).join(' · ');
  if (citation) lines.push(citation, '');
  if (paper.division) lines.push(`**Division:** ${markdownText(paper.division)}`, '');
  if (paper.keywords.length) lines.push(`**Keywords:** ${paper.keywords.map(markdownText).join(', ')}`, '');
  if (paper.abstract) lines.push('**Abstract**', '', markdownText(paper.abstract), '');
  if (paper.note) lines.push('**Private note**', '', markdownText(paper.note), '');
  if (paper.tags.length) lines.push(`**Tags:** ${paper.tags.map(markdownText).join(', ')}`, '');
  if (paper.sourceUrl) lines.push(`[Source](<${paper.sourceUrl}>)`, '');
  return lines.join('\n').trimEnd();
}

function markdownPapersExport(papers) {
  const sections = papers.map((paper, index) => markdownPaper(paper, index));
  return `# Exported papers\n\n${sections.join('\n\n')}${sections.length ? '\n' : ''}`;
}

export function exportPapers(values, format) {
  if (!Array.isArray(values)) throw new TypeError('Papers must be an array');
  const papers = values.slice(0, 10000).map(canonicalPaper);
  if (format === 'csv') return { filename: 'papers.csv', mimeType: 'text/csv;charset=utf-8', content: csvExport(papers), recordCount: papers.length };
  if (format === 'bibtex') return { filename: 'papers.bib', mimeType: 'application/x-bibtex;charset=utf-8', content: bibtexExport(papers), recordCount: papers.length };
  if (format === 'markdown') return { filename: 'papers.md', mimeType: 'text/markdown;charset=utf-8', content: markdownPapersExport(papers), recordCount: papers.length };
  throw new TypeError('Unsupported paper export format');
}

function markdownList(lines, title, values) {
  const items = cleanList(values, 100, 5000);
  if (!items.length) return;
  lines.push(`## ${title}`, '', ...items.map((item) => `- ${markdownText(item)}`), '');
}

export function exportConversation(value = {}) {
  const title = cleanText(value.title, 200) || 'Saved analysis';
  const ideaText = cleanText(value.ideaText ?? value.idea_text, 5000);
  const report = value.report && typeof value.report === 'object' && !Array.isArray(value.report) ? value.report : {};
  const profile = report.ideaProfile && typeof report.ideaProfile === 'object' && !Array.isArray(report.ideaProfile)
    ? report.ideaProfile
    : {};
  const lines = [`# ${markdownText(title)}`, ''];
  if (ideaText) lines.push('## Research idea', '', markdownText(ideaText), '');
  const summary = cleanText(profile.summary, 5000);
  if (summary) lines.push('## Idea profile', '', markdownText(summary), '');
  const profileFacts = [
    ['Topics', cleanList(profile.topics, 50, 500).join(', ')],
    ['Population', cleanText(profile.population, 2000)],
    ['Method', cleanText(profile.method, 2000)],
    ['Mechanisms', cleanList(profile.mechanisms, 50, 500).join(', ')],
  ].filter(([, item]) => item);
  if (profileFacts.length) lines.push(...profileFacts.map(([label, item]) => `**${label}:** ${markdownText(item)}`), '');

  const papers = Array.isArray(report.relatedPapers) ? report.relatedPapers.slice(0, 1000).map(canonicalPaper) : [];
  if (papers.length) {
    lines.push('## Related papers', '');
    papers.forEach((item, index) => lines.push(markdownPaper(item, index, { headingLevel: 3 }), ''));
  }

  const paths = Array.isArray(report.innovationPaths) ? report.innovationPaths.slice(0, 100) : [];
  if (paths.length) {
    lines.push('## Innovation directions', '');
    for (const path of paths) {
      const pathTitle = cleanText(path?.title, 1000);
      const rationale = cleanText(path?.rationale, 10000);
      if (pathTitle) lines.push(`### ${markdownText(pathTitle)}`, '');
      if (rationale) lines.push(markdownText(rationale), '');
    }
  }
  markdownList(lines, 'Recommended next steps', report.recommendedNextSteps);
  markdownList(lines, 'Limitations', report.limitations);
  return {
    filename: `${asciiSlug(title, 'saved-analysis')}.md`,
    mimeType: 'text/markdown;charset=utf-8',
    content: `${lines.join('\n').trimEnd()}\n`,
    recordCount: 1,
  };
}

export function downloadExport(artifact, {
  documentRef = globalThis.document,
  BlobCtor = globalThis.Blob,
  urlApi = globalThis.URL,
} = {}) {
  if (!artifact || typeof artifact.content !== 'string' || typeof artifact.filename !== 'string') {
    throw new TypeError('Invalid export artifact');
  }
  if (!documentRef?.createElement || !documentRef.body?.append || typeof BlobCtor !== 'function'
    || typeof urlApi?.createObjectURL !== 'function' || typeof urlApi?.revokeObjectURL !== 'function') {
    throw new TypeError('Browser download APIs are unavailable');
  }
  const filename = artifact.filename.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^\.+/, '').slice(0, 120) || 'export.txt';
  const blob = new BlobCtor([artifact.content], { type: artifact.mimeType || 'text/plain;charset=utf-8' });
  const objectUrl = urlApi.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  try {
    documentRef.body.append(link);
    link.click();
  } finally {
    link.remove();
    urlApi.revokeObjectURL(objectUrl);
  }
}
