import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createAuthClient } from '../public/auth-client.js';
import { initAuthUi } from '../public/auth-ui.js';
import { createAuthActionRouter } from '../public/auth-actions.js';
import { initPublicAnalysisForm } from '../public/analysis-form.js';
import { createTranslator } from '../public/i18n.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); },
  };
}

function fakeSdk(calls, { session = null, getSession } = {}) {
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
    async getSession() {
      return getSession ? getSession() : { data: { session }, error: null };
    },
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

test('a newer Auth event wins over a stale getSession response', async () => {
  const sessionResult = deferred();
  const sdk = fakeSdk([], { getSession: () => sessionResult.promise });
  const client = createAuthClient({
    sdk, url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test', storage: memoryStorage(),
  });
  client.onAuthStateChange(() => {});

  const pending = client.getSession();
  sdk.emit('SIGNED_IN', { user: { id: 'new-user', email: 'new@example.org' } });
  sessionResult.resolve({ data: { session: null }, error: null });

  assert.deepEqual(await pending, {
    status: 'authenticated',
    user: { id: 'new-user', email: 'new@example.org' },
  });
  assert.equal(client.state.status, 'authenticated');
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
  await ui.whenIdle();
  assert.deepEqual(restored.map((intent) => intent.action), ['saved-papers']);
  assert.equal(trigger.focused, true);
  assert.ok(states.includes('authenticated'));
  assert.equal(ui.state().status, 'authenticated');
});

test('intent restoration rejection is localized and remains visibly actionable', async () => {
  const sdk = fakeSdk([]);
  const client = createAuthClient({
    sdk, url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test', storage: memoryStorage(), now: () => 1_800_000,
  });
  const { dialog, elements } = fakeDialog();
  const trigger = new FakeElement();
  const ui = initAuthUi({
    authClient: client,
    dialog,
    redirectTo: 'https://example.org/',
    consumeIntent: async () => { throw new Error('private failure detail'); },
    t: (key) => `localized:${key}`,
  });

  ui.open({ action: 'saved-papers', returnHash: '#new-analysis', trigger });
  sdk.emit('SIGNED_IN', { user: { id: 'user-1', email: 'reader@example.org' } });
  await ui.whenIdle();

  assert.equal(elements['#auth-status'].textContent, 'localized:auth.error.intentRestore');
  assert.doesNotMatch(elements['#auth-status'].textContent, /private failure detail/);
  assert.equal(dialog.open, true);
  assert.equal(elements['#auth-authenticated-controls'].hidden, false);
  assert.equal(elements['#auth-sign-out'].focused, true);
  assert.equal(trigger.focused, false);
});

test('redirect restoration failure safely opens the authenticated dialog to show feedback', async () => {
  const sdk = fakeSdk([], { session: { user: { id: 'user-1', email: 'reader@example.org' } } });
  const client = createAuthClient({
    sdk, url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test', storage: memoryStorage(), now: () => 1_800_000,
  });
  client.rememberIntent({ action: 'saved-papers', returnHash: '#new-analysis' });
  const { dialog, elements } = fakeDialog();
  const ui = initAuthUi({
    authClient: client,
    dialog,
    redirectTo: 'https://example.org/',
    consumeIntent: async () => { throw new Error('must not surface'); },
    t: (key) => `localized:${key}`,
  });

  assert.equal(dialog.open, false);
  await ui.whenIdle();
  assert.equal(dialog.open, true);
  assert.equal(elements['#auth-status'].textContent, 'localized:auth.error.intentRestore');
  assert.equal(elements['#auth-authenticated-controls'].hidden, false);
  assert.equal(elements['#auth-sign-out'].focused, true);
});

test('repeated signed-in events consume once and serialize cleanup', async () => {
  const sdk = fakeSdk([]);
  const storage = memoryStorage();
  const client = createAuthClient({
    sdk, url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test', storage, now: () => 1_800_000,
  });
  const { dialog } = fakeDialog();
  const trigger = new FakeElement();
  const restoreGate = deferred();
  const restoreStarted = deferred();
  const restored = [];
  const ui = initAuthUi({
    authClient: client,
    dialog,
    redirectTo: 'https://example.org/',
    consumeIntent: async (intent) => { restored.push(intent); restoreStarted.resolve(); await restoreGate.promise; },
    t: (key) => key,
  });

  ui.open({ action: 'saved-papers', returnHash: '#new-analysis', trigger });
  sdk.emit('SIGNED_IN', { user: { id: 'user-1' } });
  sdk.emit('TOKEN_REFRESHED', { user: { id: 'user-1' } });
  await restoreStarted.promise;
  assert.equal(restored.length, 1);
  restoreGate.resolve();
  await ui.whenIdle();

  assert.equal(restored.length, 1);
  assert.equal(dialog.open, false);
  assert.equal(trigger.focused, true);
});

test('sign-out during delayed restoration prevents obsolete signed-in cleanup', async () => {
  const sdk = fakeSdk([]);
  const client = createAuthClient({
    sdk, url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test', storage: memoryStorage(), now: () => 1_800_000,
  });
  const { dialog } = fakeDialog();
  const trigger = new FakeElement();
  const restoreStarted = deferred();
  const restoreGate = deferred();
  const ui = initAuthUi({
    authClient: client,
    dialog,
    redirectTo: 'https://example.org/',
    consumeIntent: async () => { restoreStarted.resolve(); await restoreGate.promise; },
    t: (key) => key,
  });

  ui.open({ action: 'saved-papers', returnHash: '#new-analysis', trigger });
  sdk.emit('SIGNED_IN', { user: { id: 'user-1' } });
  await restoreStarted.promise;
  sdk.emit('SIGNED_OUT', null);
  restoreGate.resolve();
  await ui.whenIdle();

  assert.equal(ui.state().status, 'anonymous');
  assert.equal(dialog.open, true);
  assert.equal(trigger.focused, false);
});

test('Cancel closes through the real listener and restores focus to the opener', async () => {
  const client = createAuthClient({
    sdk: fakeSdk([]), url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test', storage: memoryStorage(),
  });
  const first = fakeDialog();
  const firstTrigger = new FakeElement();
  const firstUi = initAuthUi({ authClient: client, dialog: first.dialog, redirectTo: 'https://example.org/' });
  firstUi.open({ action: 'sign-in', returnHash: '#new-analysis', trigger: firstTrigger });
  await first.elements['#auth-cancel'].dispatch('click');
  assert.equal(first.dialog.open, false);
  assert.equal(firstTrigger.focused, true);
});

test('focus restoration clears the retained opener before focus re-enters the dialog', async () => {
  const client = createAuthClient({
    sdk: fakeSdk([]), url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test', storage: memoryStorage(),
  });
  const { dialog, elements } = fakeDialog();
  const firstTrigger = new FakeElement();
  const secondTrigger = new FakeElement();
  const ui = initAuthUi({ authClient: client, dialog, redirectTo: 'https://example.org/' });
  firstTrigger.focus = () => {
    firstTrigger.focused = true;
    ui.open({ action: 'sign-in', returnHash: '#new-analysis', trigger: secondTrigger });
  };

  ui.open({ action: 'sign-in', returnHash: '#new-analysis', trigger: firstTrigger });
  await elements['#auth-cancel'].dispatch('click');
  assert.equal(dialog.open, true);
  await elements['#auth-cancel'].dispatch('click');
  assert.equal(secondTrigger.focused, true);
});

test('application form controller submits analysis while Auth is disabled', async () => {
  const form = new FakeElement();
  const events = [];
  const router = createAuthActionRouter({
    getAuthState: () => ({ status: 'disabled', user: null }),
    openAuth: () => false,
    dispatchIntent() {},
  });
  initPublicAnalysisForm({
    form,
    readIdea: () => 'A sufficiently detailed public research idea',
    onReset: () => events.push('reset'),
    onInvalid: () => events.push('invalid'),
    onStart: () => events.push('start'),
    analyze: (idea) => router.runPublicAnalysis(async () => ({
      ok: true,
      async json() { return { data: { idea, report: true } }; },
    })),
    onSuccess: (report) => events.push(report.report ? 'success' : 'wrong'),
    onFailure: () => events.push('failure'),
    onFinish: () => events.push('finish'),
  });

  await form.dispatch('submit', { preventDefault() { events.push('prevented'); } });
  assert.deepEqual(events, ['prevented', 'reset', 'start', 'success', 'finish']);
});

test('application action router opens authenticated Account and dispatches protected navigation', async () => {
  const opened = [];
  const dispatched = [];
  let analysisCalls = 0;
  let state = { status: 'disabled', user: null };
  const router = createAuthActionRouter({
    getAuthState: () => state,
    openAuth(intent) { opened.push(intent); return state.status !== 'disabled'; },
    dispatchIntent(intent) { dispatched.push(intent); },
  });

  assert.equal(await router.runPublicAnalysis(async () => { analysisCalls += 1; return 'report'; }), 'report');
  assert.equal(analysisCalls, 1);

  state = { status: 'authenticated', user: { id: 'user-1' } };
  router.route({ action: 'sign-in', returnHash: '#new-analysis' });
  router.route({ action: 'saved-papers', returnHash: '#new-analysis' });
  assert.deepEqual(opened.map((intent) => intent.action), ['sign-in']);
  assert.deepEqual(dispatched.map((intent) => intent.action), ['saved-papers']);
});

test('authenticated Account stays open across a token refresh when no intent is pending', async () => {
  const sdk = fakeSdk([]);
  const client = createAuthClient({
    sdk, url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test', storage: memoryStorage(),
  });
  const { dialog } = fakeDialog();
  const ui = initAuthUi({ authClient: client, dialog, redirectTo: 'https://example.org/' });
  sdk.emit('SIGNED_IN', { user: { id: 'user-1' } });
  await ui.whenIdle();
  const router = createAuthActionRouter({
    getAuthState: () => ui.state(),
    openAuth: (intent) => ui.open(intent),
    dispatchIntent() {},
  });

  router.route({ action: 'sign-in', returnHash: '#new-analysis' });
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelector('#auth-authenticated-controls').hidden, false);
  assert.equal(dialog.querySelector('#auth-sign-out').focused, true);
  sdk.emit('TOKEN_REFRESHED', { user: { id: 'user-1' } });
  await ui.whenIdle();
  assert.equal(dialog.open, true);
});

test('protected action routes through Auth storage and restores exactly once', async () => {
  const sdk = fakeSdk([]);
  const storage = memoryStorage();
  const client = createAuthClient({
    sdk, url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test', storage, now: () => 1_800_000,
  });
  const { dialog } = fakeDialog();
  const restored = [];
  const ui = initAuthUi({
    authClient: client, dialog, redirectTo: 'https://example.org/', consumeIntent: (intent) => restored.push(intent),
  });
  const router = createAuthActionRouter({
    getAuthState: () => ui.state(),
    openAuth: (intent) => ui.open(intent),
    dispatchIntent: (intent) => restored.push(intent),
  });

  router.route({ action: 'save-paper', entityId: 'paper-42', returnHash: '#new-analysis' });
  assert.ok(storage.getItem('idea-radar-auth-intent'));
  sdk.emit('SIGNED_IN', { user: { id: 'user-1' } });
  sdk.emit('TOKEN_REFRESHED', { user: { id: 'user-1' } });
  await ui.whenIdle();

  assert.deepEqual(restored.map((intent) => intent.action), ['save-paper']);
  assert.equal(storage.getItem('idea-radar-auth-intent'), null);
});

test('Auth dialog copy is complete in the closed English and Chinese dictionaries', () => {
  const keys = [
    'auth.eyebrow', 'auth.title', 'auth.copy', 'auth.email', 'auth.emailSubmit', 'auth.or',
    'auth.google', 'auth.github', 'auth.authenticated', 'auth.signOut', 'auth.cancel',
    'auth.unavailableShort', 'auth.status.sending', 'auth.status.emailSent',
    'auth.status.redirecting', 'auth.status.signedOut', 'auth.error.email',
    'auth.error.emailSend', 'auth.error.provider', 'auth.error.signOut', 'auth.error.session',
    'auth.error.intentRestore',
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

test('provider failure is localized and keeps email available', async () => {
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

});
