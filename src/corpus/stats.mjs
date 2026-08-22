function count(value, path) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${path} must be a non-negative integer`);
  return value;
}

export function validateCorpusStats(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('corpus stats must be an object');
  if (!Array.isArray(value.conferences)) throw new TypeError('conferences must be an array');
  const conferences = value.conferences.map((item, index) => {
    if (!item || typeof item !== 'object') throw new TypeError(`conferences[${index}] must be an object`);
    if (typeof item.slug !== 'string' || !item.slug.trim()) throw new TypeError(`conferences[${index}].slug must be a string`);
    if (typeof item.name !== 'string' || !item.name.trim()) throw new TypeError(`conferences[${index}].name must be a string`);
    if (!Number.isInteger(item.year)) throw new TypeError(`conferences[${index}].year must be an integer`);
    return { slug: item.slug.trim(), name: item.name.trim(), year: item.year, papers: count(item.papers, `conferences[${index}].papers`) };
  });
  const latest = value.latestSuccessfulIngestionAt ?? null;
  if (latest !== null && (typeof latest !== 'string' || Number.isNaN(Date.parse(latest)))) {
    throw new TypeError('latestSuccessfulIngestionAt must be an ISO date string or null');
  }
  if (typeof value.ready !== 'boolean') throw new TypeError('ready must be boolean');
  return {
    conferences,
    paperCount: count(value.paperCount, 'paperCount'),
    papersWithAbstract: count(value.papersWithAbstract, 'papersWithAbstract'),
    embeddedPaperCount: count(value.embeddedPaperCount, 'embeddedPaperCount'),
    pendingEmbeddingCount: count(value.pendingEmbeddingCount, 'pendingEmbeddingCount'),
    failedEmbeddingCount: count(value.failedEmbeddingCount, 'failedEmbeddingCount'),
    latestSuccessfulIngestionAt: latest,
    ready: value.ready,
  };
}
