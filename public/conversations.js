const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function conversationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requireUuid(value, code = 'conversations_invalid') {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw conversationError(code);
  return value;
}

function normalizeSession(value = {}) {
  return {
    id: String(value.id ?? ''),
    title: typeof value.title === 'string' ? value.title : '',
    ideaText: typeof value.idea_text === 'string' ? value.idea_text : String(value.ideaText ?? ''),
    report: value.report && typeof value.report === 'object' && !Array.isArray(value.report) ? value.report : null,
    language: value.language === 'zh' ? 'zh' : 'en',
    corpusSnapshot: value.corpus_snapshot && typeof value.corpus_snapshot === 'object' ? value.corpus_snapshot : {},
    createdAt: typeof value.created_at === 'string' ? value.created_at : String(value.createdAt ?? ''),
    updatedAt: typeof value.updated_at === 'string' ? value.updated_at : String(value.updatedAt ?? ''),
  };
}

function normalizeMessage(value = {}) {
  return {
    sequenceNo: Number(value.sequence_no ?? value.sequenceNo),
    role: value.role === 'user' ? 'user' : 'assistant',
    content: value.content,
  };
}

export function createConversationStore({
  fetchImpl = globalThis.fetch,
  endpoint,
  getAccessToken,
  randomUUID = () => globalThis.crypto.randomUUID(),
  supabase,
  getUserId,
} = {}) {
  let retryIntent = null;

  function owner() {
    const userId = typeof getUserId === 'function' ? getUserId() : null;
    if (!supabase || !UUID_PATTERN.test(userId ?? '')) throw conversationError('conversations_auth_required');
    return userId;
  }

  async function checked(query) {
    try {
      const result = await query;
      if (result?.error) throw conversationError('conversations_unavailable');
      return result?.data ?? [];
    } catch (error) {
      if (error?.code?.startsWith?.('conversations_')) throw error;
      throw conversationError('conversations_unavailable');
    }
  }

  return Object.freeze({
    async save(input) {
      if (typeof fetchImpl !== 'function' || !endpoint || typeof getAccessToken !== 'function') {
        throw conversationError('conversations_unavailable');
      }
      const fingerprint = JSON.stringify(input);
      if (!retryIntent || retryIntent.fingerprint !== fingerprint) {
        retryIntent = { fingerprint, clientRequestId: requireUuid(randomUUID()) };
      }
      let token;
      try { token = await getAccessToken(); } catch { throw conversationError('conversations_auth_required'); }
      if (typeof token !== 'string' || !token) throw conversationError('conversations_auth_required');
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ ...input, clientRequestId: retryIntent.clientRequestId }),
        });
      } catch {
        throw conversationError('conversations_unavailable');
      }
      if (!response?.ok) {
        if (response?.status === 401) throw conversationError('conversations_auth_required');
        throw conversationError('conversations_unavailable');
      }
      const payload = await response.json();
      const result = payload?.data;
      if (!UUID_PATTERN.test(result?.sessionId ?? '')) throw conversationError('conversations_unavailable');
      retryIntent = null;
      return { sessionId: result.sessionId, createdAt: String(result.createdAt ?? '') };
    },

    async list() {
      const userId = owner();
      const rows = await checked(supabase.from('analysis_sessions')
        .select('id,title,idea_text,report,language,corpus_snapshot,created_at,updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false }));
      return Array.isArray(rows) ? rows.map(normalizeSession) : [];
    },

    async reopen(sessionId) {
      const userId = owner();
      requireUuid(sessionId);
      const sessions = await checked(supabase.from('analysis_sessions')
        .select('id,title,idea_text,report,language,corpus_snapshot,created_at,updated_at')
        .eq('user_id', userId).eq('id', sessionId));
      const session = Array.isArray(sessions) ? sessions.map(normalizeSession).find((item) => item.id === sessionId) : null;
      if (!session) throw conversationError('conversations_not_found');
      const rows = await checked(supabase.from('analysis_messages')
        .select('session_id,user_id,sequence_no,role,content')
        .eq('user_id', userId).eq('session_id', sessionId)
        .order('sequence_no', { ascending: true }));
      const messages = (Array.isArray(rows) ? rows : []).map(normalizeMessage)
        .sort((left, right) => left.sequenceNo - right.sequenceNo);
      const assistant = [...messages].reverse().find((message) => message.role === 'assistant' && message.content && typeof message.content === 'object');
      return { ...session, report: assistant?.content ?? session.report, messages };
    },

    async rename(sessionId, title) {
      const userId = owner();
      requireUuid(sessionId);
      const clean = typeof title === 'string' ? title.trim() : '';
      if (!clean || clean.length > 200) throw conversationError('conversations_invalid');
      await checked(supabase.from('analysis_sessions').update({ title: clean })
        .eq('user_id', userId).eq('id', sessionId));
      return true;
    },

    async remove(sessionId) {
      const userId = owner();
      requireUuid(sessionId);
      await checked(supabase.from('analysis_sessions').delete()
        .eq('user_id', userId).eq('id', sessionId));
      return true;
    },
  });
}

function append(documentRef, parent, tag, text, className = '') {
  const node = documentRef.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

export function renderConversationList({
  root,
  sessions = [],
  onReopen = () => {},
  onRename = () => {},
  onExport = () => {},
  onDelete = () => {},
  t = (key) => key,
} = {}) {
  if (!root?.replaceChildren) throw new TypeError('Conversation list requires a root');
  const view = sessions.map((session) => ({ ...normalizeSession(session), actions: ['reopen', 'rename', 'export', 'delete'] }));
  const documentRef = root.ownerDocument;
  if (!documentRef?.createElement) {
    root.replaceChildren(view);
    return { visibleCount: view.length, view };
  }

  const fragment = documentRef.createDocumentFragment();
  if (!view.length) append(documentRef, fragment, 'p', t('conversation.empty'), 'empty-state');
  for (const session of view) {
    const article = documentRef.createElement('article');
    article.className = 'conversation-card';
    article.dataset.sessionId = session.id;
    append(documentRef, article, 'h3', session.title || t('conversation.untitled'));
    append(documentRef, article, 'p', [session.language.toUpperCase(), session.updatedAt].filter(Boolean).join(' · '), 'conversation-meta');
    append(documentRef, article, 'p', session.ideaText, 'conversation-idea');
    const actions = documentRef.createElement('div');
    actions.className = 'conversation-actions';
    const reopen = append(documentRef, actions, 'button', t('conversation.reopen'));
    reopen.type = 'button';
    reopen.addEventListener('click', () => onReopen(session.id));
    const rename = append(documentRef, actions, 'button', t('conversation.rename'));
    rename.type = 'button';
    rename.addEventListener('click', () => onRename(session));
    const exportButton = append(documentRef, actions, 'button', t('conversation.export'));
    exportButton.type = 'button';
    exportButton.addEventListener('click', () => onExport(session));
    const remove = append(documentRef, actions, 'button', t('conversation.delete'));
    remove.type = 'button';
    remove.addEventListener('click', () => onDelete(session.id));
    article.append(actions);
    fragment.append(article);
  }
  root.replaceChildren(fragment);
  return { visibleCount: view.length, view };
}
