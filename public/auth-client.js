const INTENT_STORAGE_KEY = 'idea-radar-auth-intent';
const INTENT_MAX_AGE_MS = 15 * 60 * 1000;
const INTENT_ACTIONS = new Set([
  'sign-in',
  'saved-papers',
  'conversations',
  'save-paper',
  'save-analysis',
  'history',
  'export',
]);
const PUBLIC_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]+$/;
const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
const RETURN_HASH_PATTERN = /^#[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;

function safeStorage(storage) {
  return storage && typeof storage.getItem === 'function'
    && typeof storage.setItem === 'function' && typeof storage.removeItem === 'function'
    ? storage
    : null;
}

function isSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function authError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validateRedirect(redirectTo) {
  try {
    const url = new URL(redirectTo);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw authError('invalid_redirect');
    }
    return redirectTo;
  } catch (error) {
    if (error?.code === 'invalid_redirect') throw error;
    throw authError('invalid_redirect');
  }
}

function sessionState(session, disabled = false) {
  if (disabled) return { status: 'disabled', user: null };
  const user = session?.user;
  if (!user?.id) return { status: 'anonymous', user: null };
  return {
    status: 'authenticated',
    user: { id: String(user.id), email: typeof user.email === 'string' ? user.email : '' },
  };
}

function normalizeIntent(value, now) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!INTENT_ACTIONS.has(value.action)) return null;
  if (typeof value.entityId !== 'string' || (value.entityId && !ENTITY_ID_PATTERN.test(value.entityId))) return null;
  if (typeof value.returnHash !== 'string' || (value.returnHash && !RETURN_HASH_PATTERN.test(value.returnHash))) return null;
  if (!Number.isFinite(value.createdAt) || value.createdAt > now + 60_000 || now - value.createdAt > INTENT_MAX_AGE_MS) return null;
  return {
    action: value.action,
    entityId: value.entityId,
    returnHash: value.returnHash,
    createdAt: value.createdAt,
  };
}

export function createAuthClient({ sdk, url, publishableKey, storage, now = Date.now } = {}) {
  const intentStorage = safeStorage(storage);
  let enabled = typeof sdk?.createClient === 'function'
    && isSupabaseUrl(url)
    && PUBLIC_KEY_PATTERN.test(publishableKey ?? '');
  let state = sessionState(null, !enabled);
  let client = null;
  let stateRevision = 0;

  if (enabled) {
    try {
      client = sdk.createClient(url, publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      enabled = Boolean(client?.auth);
      state = enabled ? { status: 'loading', user: null } : sessionState(null, true);
    } catch {
      enabled = false;
      state = sessionState(null, true);
    }
  }

  function requireEnabled() {
    if (!enabled) throw authError('auth_disabled');
  }

  function rememberIntent(input = {}) {
    if (!intentStorage) return null;
    const candidate = normalizeIntent({
      action: input.action,
      entityId: typeof input.entityId === 'string' ? input.entityId : '',
      returnHash: typeof input.returnHash === 'string' ? input.returnHash : '',
      createdAt: now(),
    }, now());
    if (!candidate) {
      intentStorage.removeItem(INTENT_STORAGE_KEY);
      return null;
    }
    try {
      intentStorage.setItem(INTENT_STORAGE_KEY, JSON.stringify(candidate));
      return candidate;
    } catch {
      return null;
    }
  }

  function consumeIntent() {
    if (!intentStorage) return null;
    let encoded = null;
    try {
      encoded = intentStorage.getItem(INTENT_STORAGE_KEY);
      intentStorage.removeItem(INTENT_STORAGE_KEY);
      if (!encoded) return null;
      return normalizeIntent(JSON.parse(encoded), now());
    } catch {
      try { intentStorage.removeItem(INTENT_STORAGE_KEY); } catch { /* Optional storage is best-effort. */ }
      return null;
    }
  }

  return Object.freeze({
    enabled,
    get state() { return state; },
    getSupabaseClient() { return enabled ? client : null; },
    rememberIntent,
    consumeIntent,
    async signInWithEmail(email, { redirectTo } = {}) {
      requireEnabled();
      const normalizedEmail = typeof email === 'string' ? email.trim() : '';
      if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw authError('invalid_email');
      const result = await client.auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: validateRedirect(redirectTo) },
      });
      if (result?.error) throw authError('email_sign_in_failed');
      return result?.data ?? null;
    },
    async signInWithProvider(provider, { redirectTo } = {}) {
      requireEnabled();
      if (!['google', 'github'].includes(provider)) throw authError('invalid_provider');
      const result = await client.auth.signInWithOAuth({
        provider,
        options: { redirectTo: validateRedirect(redirectTo) },
      });
      if (result?.error) throw authError('provider_sign_in_failed');
      return result?.data ?? null;
    },
    async signOut() {
      requireEnabled();
      const result = await client.auth.signOut();
      if (result?.error) throw authError('sign_out_failed');
      state = sessionState(null);
      stateRevision += 1;
    },
    async getSession() {
      if (!enabled) return sessionState(null, true);
      const readRevision = stateRevision;
      const result = await client.auth.getSession();
      if (readRevision !== stateRevision) return state;
      if (result?.error) throw authError('session_read_failed');
      state = sessionState(result?.data?.session);
      return state;
    },
    onAuthStateChange(callback) {
      if (!enabled) {
        callback?.(sessionState(null, true));
        return { unsubscribe() {} };
      }
      const result = client.auth.onAuthStateChange((_event, session) => {
        stateRevision += 1;
        state = sessionState(session);
        callback?.(state);
      });
      return result?.data?.subscription ?? { unsubscribe() {} };
    },
  });
}
