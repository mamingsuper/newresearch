export function createWorkspaceUiState() {
  let busy = false;
  let progress = { value: 0, key: 'progress.preparing', hidden: true };
  let error = null;
  let authIntent = null;

  return {
    setBusy(value) { busy = Boolean(value); },
    setProgress({ value, key, hidden = progress.hidden }) {
      progress = { value, key, hidden: Boolean(hidden) };
    },
    progress() { return { ...progress }; },
    setError(key, params = {}) { error = { key, params }; },
    clearError() { error = null; },
    setAuthIntent(intent) { authIntent = intent || null; },
    view(t) {
      const errorText = error ? t(error.key, error.params) : '';
      const intentText = authIntent ? t(`auth.intent.${authIntent}`) : '';
      return {
        busy,
        submitLabel: t(busy ? 'form.scanning' : 'form.submit'),
        progress: { ...progress, label: t(progress.key) },
        error: errorText,
        auth: authIntent ? t('auth.unavailable', { intent: intentText }) : '',
      };
    },
  };
}

export function initWorkspaceNavigation({ sidebar, menuButton, authIntentHandler } = {}) {
  if (!sidebar || !menuButton) return { close() {}, setOpen() {} };

  const setOpen = (open) => {
    const value = Boolean(open);
    sidebar.dataset.open = String(value);
    menuButton.setAttribute('aria-expanded', String(value));
  };
  const close = ({ returnFocus = false } = {}) => {
    setOpen(false);
    if (returnFocus) menuButton.focus();
  };

  menuButton.addEventListener('click', () => setOpen(sidebar.dataset.open !== 'true'));
  sidebar.addEventListener('click', (event) => {
    const authTarget = event.target.closest('[data-auth-intent]');
    if (authTarget) {
      authIntentHandler?.(authTarget.dataset.authIntent, event);
      close();
      return;
    }
    if (event.target.closest('a[href]')) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.dataset.open === 'true') close({ returnFocus: true });
  });
  setOpen(false);
  return { close, setOpen };
}
