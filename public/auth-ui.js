function requiredElement(dialog, selector) {
  const value = dialog?.querySelector?.(selector);
  if (!value) throw new Error(`Missing Auth UI element: ${selector}`);
  return value;
}

export function initAuthUi({
  authClient,
  dialog,
  redirectTo,
  onSessionChange = () => {},
  consumeIntent = () => {},
  t = (key) => key,
} = {}) {
  if (!authClient || !dialog) throw new Error('Auth UI requires a client and dialog');

  const form = requiredElement(dialog, '#auth-form');
  const email = requiredElement(dialog, '#auth-email');
  const emailSubmit = requiredElement(dialog, '#auth-email-submit');
  const google = requiredElement(dialog, '#auth-google');
  const github = requiredElement(dialog, '#auth-github');
  const cancel = requiredElement(dialog, '#auth-cancel');
  const signOut = requiredElement(dialog, '#auth-sign-out');
  const status = requiredElement(dialog, '#auth-status');
  const anonymousControls = requiredElement(dialog, '#auth-anonymous-controls');
  const authenticatedControls = requiredElement(dialog, '#auth-authenticated-controls');
  let returnFocus = null;
  let latestState = authClient.state;
  let announcedState = latestState;
  let authRevision = 0;
  let statusKey = '';
  let sessionQueue = Promise.resolve();
  let initialSessionPromise;
  let successfulCleanupPending = false;

  function setStatus(key) {
    statusKey = key;
    status.textContent = key ? t(key) : '';
  }

  function setBusy(busy) {
    email.disabled = busy;
    emailSubmit.disabled = busy;
    google.disabled = busy;
    github.disabled = busy;
    signOut.disabled = busy;
  }

  function renderState(nextState) {
    latestState = nextState;
    const authenticated = nextState.status === 'authenticated';
    anonymousControls.hidden = authenticated;
    authenticatedControls.hidden = !authenticated;
    onSessionChange(nextState);
  }

  function restoreFocus() {
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected && typeof target.focus === 'function') target.focus();
  }

  function closeAndRestoreFocus() {
    if (dialog.open) dialog.close();
    else restoreFocus();
  }

  function showIntentRestoreFailure() {
    setStatus('auth.error.intentRestore');
    if (!dialog.open) {
      try { dialog.showModal(); } catch { return; }
    }
    signOut.focus();
  }

  async function processSession(nextState, revision) {
    if (revision !== authRevision) return;
    renderState(nextState);
    if (nextState.status !== 'authenticated') {
      successfulCleanupPending = false;
      return;
    }
    const intent = authClient.consumeIntent();
    try {
      if (intent) {
        await consumeIntent(intent);
        successfulCleanupPending = true;
      }
    } catch {
      successfulCleanupPending = false;
      if (announcedState.status === 'authenticated') showIntentRestoreFailure();
    } finally {
      if (announcedState.status !== 'authenticated') successfulCleanupPending = false;
      if (revision === authRevision && successfulCleanupPending && latestState.status === 'authenticated') {
        successfulCleanupPending = false;
        closeAndRestoreFocus();
      }
    }
  }

  function enqueueSession(nextState, revision) {
    sessionQueue = sessionQueue
      .then(() => processSession(nextState, revision))
      .catch(() => {
        if (revision === authRevision) setStatus('auth.error.session');
      });
    return sessionQueue;
  }

  dialog.addEventListener('close', restoreFocus);
  cancel.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(true);
    setStatus('auth.status.sending');
    try {
      await authClient.signInWithEmail(email.value, { redirectTo });
      setStatus('auth.status.emailSent');
    } catch (error) {
      setStatus(error?.code === 'invalid_email' ? 'auth.error.email' : 'auth.error.emailSend');
    } finally {
      setBusy(false);
    }
  });

  for (const [button, provider] of [[google, 'google'], [github, 'github']]) {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      setBusy(true);
      setStatus('auth.status.redirecting');
      try {
        await authClient.signInWithProvider(provider, { redirectTo });
      } catch {
        setStatus('auth.error.provider');
        setBusy(false);
      }
    });
  }

  signOut.addEventListener('click', async () => {
    setBusy(true);
    try {
      await authClient.signOut();
      renderState({ status: 'anonymous', user: null });
      setStatus('auth.status.signedOut');
    } catch {
      setStatus('auth.error.signOut');
    } finally {
      setBusy(false);
    }
  });

  const subscription = authClient.onAuthStateChange((state) => {
    announcedState = state;
    authRevision += 1;
    void enqueueSession(state, authRevision);
  });
  const initialRevision = authRevision;
  initialSessionPromise = authClient.getSession()
    .then((state) => {
      if (authRevision === initialRevision) {
        announcedState = state;
        return enqueueSession(state, initialRevision);
      }
      return undefined;
    })
    .catch(() => {
      if (authRevision !== initialRevision) return;
      renderState(authClient.enabled ? { status: 'anonymous', user: null } : { status: 'disabled', user: null });
      setStatus(authClient.enabled ? 'auth.error.session' : 'auth.unavailableShort');
    });

  return Object.freeze({
    open({ action = 'sign-in', entityId = '', returnHash = '', trigger = null } = {}) {
      returnFocus = trigger;
      if (!authClient.enabled) {
        setStatus('auth.unavailableShort');
        restoreFocus();
        return false;
      }
      if (latestState?.status !== 'authenticated') {
        authClient.rememberIntent({ action, entityId, returnHash });
      }
      setStatus('');
      renderState(latestState?.status === 'authenticated' ? latestState : { status: 'anonymous', user: null });
      if (!dialog.open) dialog.showModal();
      if (latestState?.status === 'authenticated') signOut.focus();
      else email.focus();
      return true;
    },
    state() { return latestState; },
    refresh() { setStatus(statusKey); },
    async whenIdle() {
      await initialSessionPromise;
      while (true) {
        const pending = sessionQueue;
        await pending;
        if (pending === sessionQueue) return;
      }
    },
    destroy() { subscription?.unsubscribe?.(); },
  });
}
