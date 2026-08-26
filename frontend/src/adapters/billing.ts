import { edgeFetch, publicEdgeFetch } from "./supabase";

export interface BillingStatus {
  plan: "free" | "pro";
  remaining: number | null;
  superRemaining: number;
  superMonthlyLimit: number;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

function safeStripeUrl(value: unknown, hostname: "checkout.stripe.com" | "billing.stripe.com") {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

async function createSession(
  endpoint: string,
  hostname: "checkout.stripe.com" | "billing.stripe.com",
  body: Record<string, unknown> = {},
  publicRequest = false,
) {
  const fetcher = publicRequest ? publicEdgeFetch : edgeFetch;
  const response = await fetcher(endpoint, { method: "POST", body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  const url = safeStripeUrl(payload?.data?.url ?? payload?.url, hostname);
  if (!response.ok || !url) return { ok: false as const, error: payload?.error?.code ?? "billing_unavailable" };
  window.location.assign(url);
  return { ok: true as const, url };
}

export const billing = {
  async createCheckout(email?: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    return createSession("create-checkout-session", "checkout.stripe.com", email ? { email } : {}, true);
  },

  async openPortal(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    return createSession("create-portal-session", "billing.stripe.com");
  },

  async status(): Promise<BillingStatus> {
    const response = await edgeFetch("billing-status");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.data) throw new Error(payload?.error?.code ?? "billing_unavailable");
    return payload.data as BillingStatus;
  },
};
