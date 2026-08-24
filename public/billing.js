const STRIPE_HOSTS = new Set(['checkout.stripe.com', 'billing.stripe.com']);

function safeStripeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && STRIPE_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

export function initBillingActions({
  upgradeButton,
  manageButton,
  planName,
  planDetails,
  status,
  getAccessToken,
  endpoint,
  redirect = (url) => window.location.assign(url),
  t = (key) => key,
} = {}) {
  let latest = { plan: 'free', remaining: null, subscriptionStatus: 'none' };

  function render() {
    const pro = latest.plan === 'pro';
    if (planName) planName.textContent = t(pro ? 'account.pro' : 'account.free');
    if (planDetails) planDetails.textContent = t(pro ? 'account.proDetails' : 'account.freeDetails', { remaining: latest.remaining ?? 0 });
    if (upgradeButton) upgradeButton.hidden = pro;
    if (manageButton) manageButton.hidden = !pro && latest.subscriptionStatus === 'none';
  }

  async function request(path) {
    const token = await getAccessToken?.();
    if (!token) throw new Error('auth_required');
    const response = await fetch(`${endpoint}/${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.code ?? 'billing_failed');
    const url = safeStripeUrl(payload?.data?.url);
    if (!url) throw new Error('invalid_billing_redirect');
    redirect(url);
  }

  async function refresh() {
    const token = await getAccessToken?.();
    if (!token) return;
    try {
      const response = await fetch(`${endpoint}/billing-status`, { headers: { authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error('billing_status_failed');
      latest = payload.data;
      render();
    } catch {
      if (status) status.textContent = t('account.billingError');
    }
  }

  upgradeButton?.addEventListener('click', async () => {
    upgradeButton.disabled = true;
    if (status) status.textContent = t('account.openingCheckout');
    try { await request('create-checkout-session'); } catch { if (status) status.textContent = t('account.checkoutError'); upgradeButton.disabled = false; }
  });
  manageButton?.addEventListener('click', async () => {
    manageButton.disabled = true;
    if (status) status.textContent = t('account.openingPortal');
    try { await request('create-portal-session'); } catch { if (status) status.textContent = t('account.portalError'); manageButton.disabled = false; }
  });
  render();
  return Object.freeze({ refresh, render, state: () => ({ ...latest }) });
}

export { safeStripeUrl };
