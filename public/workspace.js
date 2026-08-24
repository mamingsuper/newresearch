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

export function initWorkspaceNavigation({ sidebar, menuButton, authIntentHandler, mobileQuery } = {}) {
  if (!sidebar || !menuButton) return { close() {}, setOpen() {} };

  const mediaQuery = mobileQuery ?? globalThis.window?.matchMedia?.('(max-width: 1199px)') ?? { matches: false };
  let open = false;
  const firstNavigationControl = () => sidebar.querySelector?.(
    'nav a[href], nav button:not([disabled]), .account-entry:not([disabled]), select:not([disabled])',
  );
  const synchronize = ({ focusFirst = false } = {}) => {
    if (!mediaQuery.matches) open = false;
    sidebar.dataset.open = String(open);
    menuButton.setAttribute('aria-expanded', String(open));
    sidebar.inert = mediaQuery.matches && !open;
    if (focusFirst && open) firstNavigationControl()?.focus();
  };
  const setOpen = (value) => {
    open = Boolean(value) && mediaQuery.matches;
    synchronize({ focusFirst: open });
  };
  const close = ({ returnFocus = true } = {}) => {
    setOpen(false);
    if (returnFocus && mediaQuery.matches) menuButton.focus();
  };

  menuButton.addEventListener('click', () => {
    if (open) close();
    else setOpen(true);
  });
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
    if (event.key === 'Escape' && open) close();
  });
  mediaQuery.addEventListener?.('change', () => {
    open = false;
    synchronize();
  });
  synchronize();
  return { close, setOpen };
}
