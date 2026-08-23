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
  let authRevision = 0;
  let statusKey = '';

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
    if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
    returnFocus = null;
  }

  async function handleSession(nextState) {
    renderState(nextState);
    if (nextState.status !== 'authenticated') return;
    const intent = authClient.consumeIntent();
    if (intent) await consumeIntent(intent);
    if (dialog.open) dialog.close();
    else restoreFocus();
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
    authRevision += 1;
    void handleSession(state);
  });
  const initialRevision = authRevision;
  void authClient.getSession()
    .then((state) => {
      if (authRevision === initialRevision) return handleSession(state);
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
    destroy() { subscription?.unsubscribe?.(); },
  });
}
