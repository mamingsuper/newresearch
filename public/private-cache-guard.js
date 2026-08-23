const CACHE_KINDS = new Set(['saved', 'conversations', 'report']);

export function createPrivateCacheGuard() {
  let activeUserId = null;
  const owners = { saved: null, conversations: null, report: null };

  function requireKind(kind) {
    if (!CACHE_KINDS.has(kind)) throw new TypeError('Unknown private cache kind');
  }

  return Object.freeze({
    transition(nextUserId) {
      const normalized = typeof nextUserId === 'string' && nextUserId ? nextUserId : null;
      const userChanged = activeUserId !== normalized;
      const clearPrivateReport = userChanged && owners.report !== null;
      activeUserId = normalized;
      if (userChanged) {
        owners.saved = null;
        owners.conversations = null;
        owners.report = null;
      }
      return Object.freeze({ userChanged, clearPrivateReport });
    },
    mark(kind, ownerId) {
      requireKind(kind);
      if (!activeUserId || ownerId !== activeUserId) return false;
      owners[kind] = ownerId;
      return true;
    },
    owns(kind, ownerId) {
      requireKind(kind);
      return Boolean(activeUserId && ownerId === activeUserId && owners[kind] === ownerId);
    },
    isActive(ownerId) {
      return Boolean(activeUserId && ownerId === activeUserId);
    },
    clear(kind) {
      requireKind(kind);
      owners[kind] = null;
    },
  });
}
