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
