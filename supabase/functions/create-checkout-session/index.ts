const origins = new Set([
  'https://mamingsuper.github.io',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:8080',
  'http://localhost:8443',
  'http://127.0.0.1:8443',
]);

const env = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name}`);
  return value;
};

function headers(req: Request) {
  const origin = req.headers.get('origin');
  const value = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    vary: 'Origin',
  });
  if (origin && origins.has(origin)) value.set('access-control-allow-origin', origin);
  return value;
}

const json = (req: Request, data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: headers(req) });

async function authUser(req: Request) {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token) return null;
  const key = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const response = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: key, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? { id: String(user.id), email: String(user.email || '') } : null;
}

async function rpc(name: string, body: unknown) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('rpc_failed');
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function stripe(path: string, params: URLSearchParams) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(String(data?.error?.code || 'stripe_failed'));
  return data;
}

async function readEmail(req: Request): Promise<string> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > 2048) throw new TypeError('invalid_email');
  const text = await req.text();
  if (text.length > 2048) throw new TypeError('invalid_email');
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; } catch { throw new TypeError('invalid_email'); }
  const email = body && typeof body === 'object' && !Array.isArray(body) && 'email' in body
    ? String((body as { email?: unknown }).email ?? '').normalize('NFKC').trim().toLowerCase()
    : '';
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TypeError('invalid_email');
  return email;
}

async function emailHash(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (origin && !origins.has(origin)) return json(req, { error: { code: 'ORIGIN_NOT_ALLOWED' } }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, { error: { code: 'METHOD_NOT_ALLOWED' } }, 405);

  try {
    const user = await authUser(req);
    if (!user && req.headers.has('authorization')) return json(req, { error: { code: 'AUTH_REQUIRED' } }, 401);

    let guestEmail = '';
    let pendingEmailHash = '';
    if (!user) {
      guestEmail = await readEmail(req);
      pendingEmailHash = await emailHash(guestEmail);
      const clientHash = await networkRateLimitKey(req, env('RATE_LIMIT_HMAC_KEY'));
      const rows = await rpc('consume_beta_rate_limit', { client_hash: clientHash });
      const rate = Array.isArray(rows) ? rows[0] : rows;
      if (rate?.allowed !== true) {
        return json(req, { error: { code: 'RATE_LIMITED' } }, 429);
      }
    }

    let context: Record<string, unknown> = {};
    if (user) {
      const rows = await rpc('get_billing_context', { target_user_id: user.id });
      context = (Array.isArray(rows) ? rows[0] : rows) ?? {};
      if (['active', 'trialing'].includes(String(context?.subscription_status || ''))) {
        return json(req, { error: { code: 'ALREADY_SUBSCRIBED' } }, 409);
      }
    }

    let customer = String(context?.stripe_customer_id || '');
    if (user && !customer) {
      const created = await stripe('customers', new URLSearchParams({
        email: user.email,
        'metadata[supabase_user_id]': user.id,
      }));
      customer = String(created.id);
      await rpc('upsert_stripe_customer', {
        target_user_id: user.id,
        target_customer_id: customer,
      });
    }

    const params = new URLSearchParams({
      mode: 'subscription',
      allow_promotion_codes: 'true',
      payment_method_collection: 'if_required',
      'line_items[0][price]': env('STRIPE_PRICE_ID'),
      'line_items[0][quantity]': '1',
      success_url: 'https://mamingsuper.github.io/newresearch/?checkout=success#new-analysis',
      cancel_url: 'https://mamingsuper.github.io/newresearch/?checkout=cancelled#new-analysis',
    });
    if (user) {
      params.set('customer', customer);
      params.set('client_reference_id', user.id);
      params.set('metadata[supabase_user_id]', user.id);
      params.set('subscription_data[metadata][supabase_user_id]', user.id);
    } else {
      params.set('customer_email', guestEmail);
      params.set('metadata[pending_email_hash]', pendingEmailHash);
      params.set('subscription_data[metadata][pending_email_hash]', pendingEmailHash);
    }
    const session = await stripe('checkout/sessions', params);
    return json(req, { data: { url: session.url } });
  } catch {
    return json(req, { error: { code: 'CHECKOUT_UNAVAILABLE' } }, 503);
  }
});
import { networkRateLimitKey } from '../_shared/request-identity.ts';
