const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function savedPaperError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requireUuid(value, code = 'saved_papers_invalid_paper') {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw savedPaperError(code);
  return value;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags) || tags.length > 20) throw savedPaperError('saved_papers_invalid_tags');
  const normalized = tags.map((tag) => typeof tag === 'string' ? tag.trim() : '');
  if (normalized.some((tag) => !tag || tag.length > 64)) throw savedPaperError('saved_papers_invalid_tags');
  return [...new Set(normalized)];
}

function normalizeAuthors(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((author) => ({ name: typeof author?.name === 'string' ? author.name.trim() : '' }))
    .filter((author) => author.name);
}

function safeSourceUrl(value) {
  try {
    const url = new URL(typeof value === 'string' ? value : '');
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function normalizeItem(item = {}) {
  const conferenceYear = item.conference_year ?? item.conferenceYear;
  return {
    paperId: typeof item.paper_id === 'string' ? item.paper_id : String(item.paperId ?? ''),
    note: typeof item.note === 'string' ? item.note : '',
    tags: Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === 'string') : [],
    title: typeof item.title === 'string' ? item.title : '',
    authors: normalizeAuthors(item.authors),
    abstract: typeof item.abstract === 'string' ? item.abstract : '',
    conferenceName: typeof item.conference_name === 'string' ? item.conference_name : String(item.conferenceName ?? ''),
    conferenceYear: conferenceYear !== null && conferenceYear !== undefined && conferenceYear !== ''
      && Number.isInteger(Number(conferenceYear)) ? Number(conferenceYear) : null,
    division: typeof item.division === 'string' ? item.division : '',
    keywords: Array.isArray(item.keywords) ? item.keywords.filter((keyword) => typeof keyword === 'string') : [],
    sourceUrl: safeSourceUrl(item.source_url ?? item.sourceUrl),
  };
}

export function createSavedPaperStore({ supabase, getUserId } = {}) {
  function context() {
    const userId = typeof getUserId === 'function' ? getUserId() : null;
    if (!supabase || !UUID_PATTERN.test(userId ?? '')) throw savedPaperError('saved_papers_auth_required');
    return userId;
  }

  async function checked(operation) {
    try {
      const result = await operation;
      if (result?.error) throw savedPaperError('saved_papers_unavailable');
      return result?.data ?? null;
    } catch (error) {
      if (error?.code?.startsWith?.('saved_papers_')) throw error;
      throw savedPaperError('saved_papers_unavailable');
    }
  }

  return Object.freeze({
    async list() {
      context();
      const data = await checked(supabase.rpc('get_my_saved_papers'));
      return Array.isArray(data) ? data.map(normalizeItem) : [];
    },
    async save(paperId) {
      const userId = context();
      requireUuid(paperId);
      await checked(supabase.from('saved_papers').upsert(
        { user_id: userId, paper_id: paperId },
        { onConflict: 'user_id,paper_id', ignoreDuplicates: true },
      ));
      return true;
    },
    async remove(paperId) {
      const userId = context();
      requireUuid(paperId);
      await checked(supabase.from('saved_papers').delete().eq('user_id', userId).eq('paper_id', paperId));
      return true;
    },
    async updateNote(paperId, { note = '', tags = [] } = {}) {
      const userId = context();
      requireUuid(paperId);
      if (typeof note !== 'string' || note.length > 4000) throw savedPaperError('saved_papers_invalid_note');
      const normalizedTags = normalizeTags(tags);
      await checked(supabase.from('saved_papers').update({ note, tags: normalizedTags })
        .eq('user_id', userId).eq('paper_id', paperId));
      return true;
    },
  });
}

export function createOptimisticSavedPaperController({ store, onChange = () => {}, onError = () => {} } = {}) {
  if (!store) throw new TypeError('Saved-paper controller requires a store');
  const saved = new Set();
  const pending = new Set();

  function snapshot() {
    return Object.freeze({ savedIds: [...saved], pendingIds: [...pending] });
  }
  function emit() { onChange(snapshot()); }

  async function mutate(paperId, nextSaved, operation) {
    if (pending.has(paperId) || saved.has(paperId) === nextSaved) return false;
    const previous = saved.has(paperId);
    pending.add(paperId);
    if (nextSaved) saved.add(paperId); else saved.delete(paperId);
    emit();
    try {
      await operation();
      pending.delete(paperId);
      emit();
      return true;
    } catch (error) {
      if (previous) saved.add(paperId); else saved.delete(paperId);
      pending.delete(paperId);
      emit();
      onError(error?.code ?? 'saved_papers_unavailable');
      return false;
    }
  }

  return Object.freeze({
    replace(items) {
      saved.clear();
      for (const item of items ?? []) if (UUID_PATTERN.test(item?.paperId ?? '')) saved.add(item.paperId);
      emit();
    },
    save(paperId) { return mutate(paperId, true, () => store.save(paperId)); },
    remove(paperId) { return mutate(paperId, false, () => store.remove(paperId)); },
    isSaved: (paperId) => saved.has(paperId),
    isPending: (paperId) => pending.has(paperId),
    snapshot,
  });
}

export function filterSavedPapers(items, query = '') {
  const terms = String(query).toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...(items ?? [])];
  return (items ?? []).filter((item) => {
    const haystack = [
      item.title, item.abstract, item.conferenceName, item.conferenceYear, item.division, item.note,
      ...(item.authors ?? []).map((author) => author.name), ...(item.keywords ?? []), ...(item.tags ?? []),
    ].join(' ').toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function libraryView(items, query) {
  return filterSavedPapers(items, query).map((item) => ({
    ...normalizeItem(item),
    sourceRel: item.sourceUrl ? 'noopener noreferrer' : '',
  }));
}

function appendText(documentRef, parent, tag, text, className = '') {
  const node = documentRef.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

export function renderSavedPaperLibrary({
  root, items = [], query = '', onRemove = () => {}, onExport = () => {}, onUpdateNote = () => {}, t = (key) => key,
} = {}) {
  if (!root?.replaceChildren) throw new TypeError('Saved-paper library requires a root');
  const view = libraryView(items, query);
  const documentRef = root.ownerDocument;
  if (!documentRef?.createElement) {
    root.replaceChildren(view);
    return { visibleCount: view.length, view };
  }

  const fragment = documentRef.createDocumentFragment();
  if (!view.length) {
    appendText(documentRef, fragment, 'p', items.length ? t('saved.emptyFilter') : t('saved.empty'), 'empty-state');
  }
  for (const item of view) {
    const article = documentRef.createElement('article');
    article.className = 'saved-paper-card';
    article.dataset.paperId = item.paperId;
    appendText(documentRef, article, 'h3', item.title || t('report.untitled'));
    appendText(documentRef, article, 'p', [item.authors.map((author) => author.name).join(', '), item.conferenceName, item.conferenceYear].filter(Boolean).join(' · '), 'saved-paper-citation');
    appendText(documentRef, article, 'p', item.abstract || t('report.abstractUnavailable'), 'saved-paper-abstract');
    if (item.tags.length) appendText(documentRef, article, 'p', item.tags.map((tag) => `#${tag}`).join(' '), 'saved-paper-tags');

    const noteLabel = appendText(documentRef, article, 'label', t('saved.note'));
    const note = documentRef.createElement('textarea');
    note.value = item.note;
    note.maxLength = 4000;
    note.rows = 3;
    noteLabel.append(note);
    const tagsLabel = appendText(documentRef, article, 'label', t('saved.tags'));
    const tags = documentRef.createElement('input');
    tags.type = 'text';
    tags.value = item.tags.join(', ');
    tagsLabel.append(tags);

    const actions = documentRef.createElement('div');
    actions.className = 'saved-paper-actions';
    const update = appendText(documentRef, actions, 'button', t('saved.update'));
    update.type = 'button';
    update.addEventListener('click', () => onUpdateNote(item.paperId, {
      note: note.value,
      tags: tags.value.split(',').map((tag) => tag.trim()).filter(Boolean),
    }));
    const remove = appendText(documentRef, actions, 'button', t('saved.remove'));
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try { await onRemove(item.paperId); } finally { if (remove.isConnected) remove.disabled = false; }
    });
    const exportButton = appendText(documentRef, actions, 'button', t('saved.export'));
    exportButton.type = 'button';
    exportButton.addEventListener('click', () => onExport(item));
    if (item.sourceUrl) {
      const source = appendText(documentRef, actions, 'a', t('report.originalProgram'));
      source.href = item.sourceUrl;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
    }
    article.append(actions);
    fragment.append(article);
  }
  root.replaceChildren(fragment);
  return { visibleCount: view.length, view };
}
