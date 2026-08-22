import { createHash } from 'node:crypto';

function line(label, value) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text ? `${label}: ${text}` : null;
}

export function buildEmbeddingText(paper) {
  const lines = [
    line('Title', paper.title),
    line('Conference', `${paper.conference?.name ?? ''} ${paper.conference?.year ?? ''}`.trim()),
    line('Division', paper.division),
    line('Keywords', Array.isArray(paper.keywords) ? paper.keywords.join(', ') : ''),
    line('Abstract', paper.abstract),
  ].filter(Boolean);
  return lines.join('\n');
}

export function embeddingInputHash(paper) {
  return createHash('sha256').update(buildEmbeddingText(paper), 'utf8').digest('hex');
}
