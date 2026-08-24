export function createAuthActionRouter({
  getAuthState,
  openAuth,
  dispatchIntent,
  onUnavailable = () => {},
} = {}) {
  if (typeof getAuthState !== 'function' || typeof openAuth !== 'function' || typeof dispatchIntent !== 'function') {
    throw new Error('Auth action router requires state, open, and dispatch functions');
  }

  return Object.freeze({
    runPublicAnalysis(operation) {
      if (typeof operation !== 'function') throw new TypeError('Public analysis operation must be a function');
      return operation();
    },
    route({ action, entityId = '', returnHash = '', trigger = null } = {}) {
      const intent = { action, entityId, returnHash, trigger };
      if (action === 'sign-in') {
        const opened = Boolean(openAuth(intent));
        if (!opened) onUnavailable(action);
        return opened;
      }
      if (getAuthState()?.status === 'authenticated') {
        dispatchIntent({ action, entityId, returnHash });
        return true;
      }
      const opened = Boolean(openAuth(intent));
      if (!opened) onUnavailable(action);
      return opened;
    },
  });
}
