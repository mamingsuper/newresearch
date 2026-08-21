const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'i', 'in',
  'is', 'it', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'this', 'to', 'we',
  'whether', 'with', 'want', 'study', 'research', 'among', 'effect', 'effects',
]);

export function tokenize(value) {
  if (typeof value !== 'string') return [];
  const matches = value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(matches.filter((token) => token.length > 1 && !STOP_WORDS.has(token)))];
}

function countMatches(tokens, text) {
  const haystack = new Set(tokenize(text));
  return tokens.filter((token) => haystack.has(token));
}

function buildExcerpt(abstract, overlapTerms, maxLength = 280) {
  const clean = String(abstract ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const lower = clean.toLocaleLowerCase();
  const positions = overlapTerms
    .map((term) => lower.indexOf(term.toLocaleLowerCase()))
    .filter((index) => index >= 0);
  const center = positions.length > 0 ? Math.min(...positions) : 0;
  const start = Math.max(0, center - Math.floor(maxLength / 3));
  const end = Math.min(clean.length, start + maxLength);
  return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`;
}

export class LocalPaperRetriever {
  constructor(papers) {
    if (!Array.isArray(papers)) throw new TypeError('papers must be an array');
    this.papers = papers;
  }

  async search({ query, limit = 10 }) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    return this.papers
      .map((paper) => {
        const titleMatches = countMatches(queryTokens, paper.title ?? '');
        const keywordMatches = countMatches(queryTokens, (paper.keywords ?? []).join(' '));
        const abstractMatches = countMatches(queryTokens, paper.abstract ?? '');
        const overlapTerms = [
          ...new Set([...titleMatches, ...keywordMatches, ...abstractMatches]),
        ];
        const score = titleMatches.length * 4 + keywordMatches.length * 3 + abstractMatches.length;
        return {
          paper,
          score,
          overlapTerms,
          evidenceExcerpt: buildExcerpt(paper.abstract, overlapTerms),
        };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || a.paper.title.localeCompare(b.paper.title))
      .slice(0, Math.max(0, limit));
  }
}
