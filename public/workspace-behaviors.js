const asArray = (value) => Array.isArray(value) ? value : [];
const formatCount = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '—';

export function scrollBehaviorForMotionPreference(prefersReducedMotion) {
  return prefersReducedMotion ? 'auto' : 'smooth';
}

export function normalizeCorpus(payload) {
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

export function createCorpusStatusModel(payload, mode, t) {
  const corpus = normalizeCorpus(payload);
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
  const abstractCount = Number.isInteger(abstracts) ? abstracts : count;
  const ledgerText = conferenceParts.length
    ? `${conferenceParts.join(' + ')}${Number.isInteger(abstractCount) ? ` = ${t('corpus.abstracts', { count: formatCount(abstractCount) })}` : ''}`
    : '';
  const modeLabel = mode === 'live' ? t('corpus.live') : mode === 'mock' ? t('corpus.demo') : t('corpus.default');
  const modeText = `${modeLabel}${Number.isInteger(count) ? ` · ${t('corpus.papers', { count: formatCount(count) })}` : ''}`;

  return { corpus, ledgerText, modeText };
}
