function safeHttps(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function text(value, max = 4000) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().slice(0, max) : '';
}

export function buildConferenceCard(row = {}) {
  const programUrl = safeHttps(row.program_url ?? row.programUrl ?? row.official_conference_url ?? row.officialConferenceUrl);
  const coverage = text(row.coverage_status ?? row.coverageStatus, 32) || 'program_only';
  return Object.freeze({
    slug: text(row.slug, 100),
    name: text(row.conference_name ?? row.name, 200),
    acronym: text(row.conference_acronym ?? row.acronym, 32),
    year: Number.isInteger(Number(row.conference_year ?? row.year)) ? Number(row.conference_year ?? row.year) : null,
    discipline: text(row.discipline, 100),
    coverageStatus: coverage,
    status: coverage.replaceAll('_', ' '),
    paperCount: Math.max(0, Number(row.paper_count ?? row.paperCount) || 0),
    provenance: text(row.provenance_note ?? row.provenance, 4000),
    lastVerifiedAt: text(row.last_verified_at ?? row.lastVerifiedAt, 64),
    link: programUrl ? { href: programUrl, rel: 'noopener noreferrer' } : null,
  });
}

export async function loadConferencePrograms({ supabase, filters = {} } = {}) {
  if (!supabase?.from) return [];
  let query = supabase.from('conference_programs').select('slug,conference_name,conference_acronym,conference_year,discipline,official_conference_url,program_url,coverage_status,paper_count,provenance_note,last_verified_at');
  if (filters.discipline) query = query.eq('discipline', text(filters.discipline, 100));
  if (filters.year) query = query.eq('conference_year', Number(filters.year));
  const { data, error } = await query.order('conference_year', { ascending: false }).order('conference_name', { ascending: true });
  if (error) throw new Error('conference_library_unavailable');
  return (Array.isArray(data) ? data : []).map(buildConferenceCard);
}

function node(document, tag, value, className) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value !== undefined) item.textContent = value;
  return item;
}

export function renderConferencePrograms({ root, programs = [], t = (key) => key } = {}) {
  if (!root?.ownerDocument || !root?.replaceChildren) return { visibleCount: programs.length };
  const { ownerDocument: document } = root;
  const fragment = document.createDocumentFragment();
  if (!programs.length) fragment.append(node(document, 'p', t('conference.empty'), 'empty-state'));
  for (const program of programs) {
    const card = node(document, 'article', undefined, 'conference-card');
    card.append(node(document, 'p', `${program.acronym || program.name} · ${program.year ?? '·'} · ${program.discipline}`, 'conference-meta'));
    card.append(node(document, 'h3', program.name || t('conference.untitled')));
    card.append(node(document, 'p', t(`conference.coverage.${program.coverageStatus}`), 'conference-coverage'));
    card.append(node(document, 'p', t('conference.paperCount', { count: program.paperCount })));
    if (program.provenance) card.append(node(document, 'p', program.provenance, 'conference-provenance'));
    if (program.link) {
      const link = node(document, 'a', t('conference.openProgram'));
      link.href = program.link.href;
      link.target = '_blank';
      link.rel = program.link.rel;
      card.append(link);
    }
    fragment.append(card);
  }
  root.replaceChildren(fragment);
  return { visibleCount: programs.length };
}
