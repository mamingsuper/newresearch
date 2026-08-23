import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createAuthClient } from '../public/auth-client.js';
import { initAuthUi } from '../public/auth-ui.js';
import { createTranslator } from '../public/i18n.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); },
  };
}

function fakeSdk(calls, { session = null } = {}) {
  let authListener = null;
  const auth = {
    async signInWithOtp(input) {
      calls.push({ method: 'signInWithOtp', ...input });
      return { data: {}, error: null };
    },
    async signInWithOAuth(input) {
      calls.push({ method: 'signInWithOAuth', ...input });
      return { data: {}, error: null };
    },
    async signOut() {
      calls.push({ method: 'signOut' });
      return { error: null };
    },
    async getSession() { return { data: { session }, error: null }; },
    onAuthStateChange(listener) {
      authListener = listener;
      return { data: { subscription: { unsubscribe() {} } } };
    },
  };
  return {
    createClient(url, key, options) {
      calls.push({ method: 'createClient', url, key, options });
      return { auth };
    },
    emit(event, nextSession) { authListener?.(event, nextSession); },
  };
}

class FakeElement {
  constructor() {
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.focused = false;
    this.isConnected = true;
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  async dispatch(type, event = {}) { return this.listeners.get(type)?.(event); }
  focus() { this.focused = true; }
}

function fakeDialog() {
  const elements = Object.fromEntries([
    'auth-form', 'auth-email', 'auth-email-submit', 'auth-google', 'auth-github',
    'auth-cancel', 'auth-sign-out', 'auth-status', 'auth-anonymous-controls',
    'auth-authenticated-controls',
  ].map((id) => [`#${id}`, new FakeElement()]));
  const dialog = new FakeElement();
  dialog.open = false;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => {
    dialog.open = false;
    dialog.listeners.get('close')?.();
  };
  dialog.querySelector = (selector) => elements[selector] ?? null;
  return { dialog, elements };
}

test('Auth disables cleanly without pinned SDK or valid public configuration', () => {
  assert.equal(createAuthClient({ sdk: null, url: '', publishableKey: '' }).enabled, false);
  assert.equal(createAuthClient({ sdk: {}, url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test' }).enabled, false);
  assert.equal(createAuthClient({ sdk: { createClient() {} }, url: 'javascript:alert(1)', publishableKey: 'sb_publishable_test' }).enabled, false);
  assert.equal(createAuthClient({ sdk: { createClient() {} }, url: 'https://p.supabase.co', publishableKey: 'service_role_secret' }).enabled, false);
  assert.equal(createAuthClient({ sdk: { createClient() { throw new Error('storage denied'); } }, url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test' }).enabled, false);
});

test('client uses persistent browser Auth options and exact safe redirects', async () => {
  const calls = [];
  const sdk = fakeSdk(calls);
  const client = createAuthClient({
    sdk,
    url: 'https://p.supabase.co',
    publishableKey: 'sb_publishable_test',
    storage: memoryStorage(),
  });

  assert.equal(client.enabled, true);
  assert.deepEqual(calls[0].options.auth, {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  });

  const redirectTo = 'https://mamingsuper.github.io/newresearch/';
  await client.signInWithEmail('reader@example.org', { redirectTo });
  await client.signInWithProvider('github', { redirectTo });
  assert.deepEqual(calls[1], {
    method: 'signInWithOtp',
    email: 'reader@example.org',
    options: { emailRedirectTo: redirectTo },
  });
  assert.deepEqual(calls[2], {
    method: 'signInWithOAuth',
    provider: 'github',
    options: { redirectTo },
  });
});

test('invalid email and provider are rejected before an SDK call', async () => {
  const calls = [];
  const client = createAuthClient({
    sdk: fakeSdk(calls),
    url: 'https://p.supabase.co',
    publishableKey: 'sb_publishable_test',
    storage: memoryStorage(),
  });

  await assert.rejects(client.signInWithEmail('not-an-email', { redirectTo: 'https://example.org/' }), /invalid_email/);
  await assert.rejects(client.signInWithProvider('twitter', { redirectTo: 'https://example.org/' }), /invalid_provider/);
  assert.deepEqual(calls.map((call) => call.method), ['createClient']);
});

test('pending Auth intent stores only an allowlisted bounded locator and consumes once', () => {
  const storage = memoryStorage();
  const now = () => 1_800_000;
  const client = createAuthClient({
    sdk: fakeSdk([]),
    url: 'https://p.supabase.co',
    publishableKey: 'sb_publishable_test',
    storage,
    now,
  });

  const intent = client.rememberIntent({
    action: 'save-paper',
    entityId: 'paper-42',
    returnHash: '#new-analysis',
    idea: 'a private research idea',
    report: { private: true },
    email: 'reader@example.org',
  });
  assert.deepEqual(intent, {
    action: 'save-paper',
    entityId: 'paper-42',
    returnHash: '#new-analysis',
    createdAt: 1_800_000,
  });
  assert.deepEqual(Object.keys(JSON.parse(storage.snapshot()['idea-radar-auth-intent'])).sort(), ['action', 'createdAt', 'entityId', 'returnHash']);
  assert.doesNotMatch(JSON.stringify(storage.snapshot()), /private research idea|reader@example\.org|report/i);
  assert.deepEqual(client.consumeIntent(), intent);
  assert.equal(client.consumeIntent(), null);
});

test('malformed, unknown, and expired pending intents are rejected and cleared', () => {
  const cases = [
    '{broken',
    JSON.stringify({ action: 'steal-data', entityId: '', returnHash: '#new-analysis', createdAt: 1_800_000 }),
    JSON.stringify({ action: 'saved-papers', entityId: '', returnHash: '#new-analysis', createdAt: 899_999 }),
    JSON.stringify({ action: 'saved-papers', entityId: '', returnHash: '#new-analysis?idea=secret', createdAt: 1_800_000 }),
  ];
  for (const encoded of cases) {
    const storage = memoryStorage({ 'idea-radar-auth-intent': encoded });
    const client = createAuthClient({
      sdk: fakeSdk([]), url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test', storage, now: () => 1_800_000,
    });
    assert.equal(client.consumeIntent(), null);
    assert.equal(storage.getItem('idea-radar-auth-intent'), null);
  }
});

test('Auth UI restores one pending intent and focus on authentication', async () => {
  const calls = [];
  const sdk = fakeSdk(calls);
  const client = createAuthClient({
    sdk, url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test', storage: memoryStorage(), now: () => 1_800_000,
  });
  const { dialog } = fakeDialog();
  const trigger = new FakeElement();
  const restored = [];
  const states = [];
  const ui = initAuthUi({
    authClient: client,
    dialog,
    redirectTo: 'https://mamingsuper.github.io/newresearch/',
    onSessionChange(state) { states.push(state.status); },
    consumeIntent(intent) { restored.push(intent); },
    t: (key) => key,
  });

  ui.open({ action: 'saved-papers', returnHash: '#new-analysis', trigger });
  assert.equal(dialog.open, true);
  sdk.emit('SIGNED_IN', { user: { id: 'user-1', email: 'reader@example.org' } });
  await Promise.resolve();

  assert.deepEqual(restored.map((intent) => intent.action), ['saved-papers']);
  sdk.emit('TOKEN_REFRESHED', { user: { id: 'user-1', email: 'reader@example.org' } });
  await Promise.resolve();
  assert.deepEqual(restored.map((intent) => intent.action), ['saved-papers']);
  assert.equal(trigger.focused, true);
  assert.ok(states.includes('authenticated'));
  assert.equal(ui.state().status, 'authenticated');
});

test('Auth dialog copy is complete in the closed English and Chinese dictionaries', () => {
  const keys = [
    'auth.eyebrow', 'auth.title', 'auth.copy', 'auth.email', 'auth.emailSubmit', 'auth.or',
    'auth.google', 'auth.github', 'auth.authenticated', 'auth.signOut', 'auth.cancel',
    'auth.unavailableShort', 'auth.status.sending', 'auth.status.emailSent',
    'auth.status.redirecting', 'auth.status.signedOut', 'auth.error.email',
    'auth.error.emailSend', 'auth.error.provider', 'auth.error.signOut', 'auth.error.session',
  ];
  for (const locale of ['en', 'zh']) {
    const { t } = createTranslator({ locale });
    for (const key of keys) assert.notEqual(t(key), key, `${locale} is missing ${key}`);
  }
});

test('sign-in UI uses a native labelled dialog with an announced status region', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<dialog[^>]*id="auth-dialog"[^>]*aria-labelledby="auth-dialog-title"/i);
  assert.match(html, /<label[^>]*for="auth-email"/i);
  assert.match(html, /id="auth-email"[^>]*type="email"[^>]*autocomplete="email"/i);
  assert.match(html, /id="auth-status"[^>]*role="status"[^>]*aria-live="polite"/i);
  assert.match(html, /id="auth-cancel"[^>]*type="button"/i);
});

test('provider failure is localized, keeps email available, and anonymous analysis stays independent', async () => {
  const { dialog, elements } = fakeDialog();
  const authClient = {
    enabled: true,
    rememberIntent() {}, consumeIntent() { return null; },
    async getSession() { return { status: 'anonymous', user: null }; },
    onAuthStateChange() { return { unsubscribe() {} }; },
    async signInWithProvider() { throw new Error('provider leaked detail'); },
    async signInWithEmail() { return {}; }, async signOut() {},
  };
  initAuthUi({ authClient, dialog, redirectTo: 'https://example.org/', t: (key) => `localized:${key}` });
  await elements['#auth-google'].dispatch('click', { preventDefault() {} });

  assert.equal(elements['#auth-status'].textContent, 'localized:auth.error.provider');
  assert.equal(elements['#auth-email'].disabled, false);
  assert.equal(elements['#auth-email-submit'].disabled, false);
  assert.doesNotMatch(elements['#auth-status'].textContent, /leaked detail/);

  const app = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../public/app.js', import.meta.url), 'utf8'));
  assert.match(app, /fetch\(apiEndpoint\('analyze-idea'/);
  assert.doesNotMatch(app, /if\s*\([^)]*auth[^)]*\)\s*[^\n]*fetch\(apiEndpoint\('analyze-idea'/i);
});
