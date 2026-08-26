const env = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name}`);
  return value;
};

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let value = 0;
  for (let index = 0; index < left.length; index += 1) {
    value |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return value === 0;
}

async function verify(body: string, header: string) {
  const pairs = header.split(',').map((value) => value.split('=', 2));
  const timestamp = Number(pairs.find(([key]) => key === 't')?.[1]);
  const signatures = pairs.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || !signatures.length) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env('STRIPE_WEBHOOK_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return signatures.some((value) => secureEqual(value, expected));
}

async function rpc(body: unknown) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(
    `${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/rpc/process_guest_stripe_billing_event`,
    {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw new Error('rpc_failed');
}

async function getSubscription(subscriptionId: string) {
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) throw new Error('invalid_subscription');
  const url = new URL(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  url.searchParams.append('expand[]', 'items.data.price');
  url.searchParams.append('expand[]', 'discounts.promotion_code');
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${env('STRIPE_SECRET_KEY')}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(String(data?.error?.code || 'stripe_failed'));
  return data;
}

function objectId(value: unknown, prefix: string) {
  const id = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id?: unknown }).id || '')
      : '';
  return id.startsWith(prefix) ? id : '';
}

function discountIds(subscription: Record<string, unknown>) {
  const discounts = Array.isArray(subscription.discounts) ? subscription.discounts : [];
  const discount = discounts.find((value) => value && typeof value === 'object') as Record<string, unknown> | undefined;
  const source = discount?.source && typeof discount.source === 'object'
    ? discount.source as Record<string, unknown>
    : undefined;
  return {
    promotionCodeId: objectId(discount?.promotion_code, 'promo_'),
    couponId: objectId(discount?.coupon || source?.coupon, ''),
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: { allow: 'POST' } });
  const body = await req.text();
  if (body.length > 1024 * 1024) return new Response('payload too large', { status: 413 });
  if (!await verify(body, req.headers.get('stripe-signature') || '')) {
    return new Response('bad signature', { status: 400 });
  }

  try {
    const event = JSON.parse(body);
    const object = event?.data?.object || {};
    const supported = event.type === 'checkout.session.completed'
      || String(event.type || '').startsWith('customer.subscription.');
    if (!supported) return Response.json({ received: true });

    let billingObject = object;
    if (event.type === 'checkout.session.completed') {
      const subscriptionId = objectId(object.subscription, 'sub_');
      if (!subscriptionId) throw new Error('missing_subscription');
      billingObject = await getSubscription(subscriptionId);
    }

    const item = billingObject?.items?.data?.[0] || {};
    const userId = String(
      billingObject?.metadata?.supabase_user_id
      || object?.metadata?.supabase_user_id
      || object?.client_reference_id
      || '',
    ) || null;
    const pendingEmailHash = String(
      billingObject?.metadata?.pending_email_hash
      || object?.metadata?.pending_email_hash
      || '',
    ) || null;
    const discount = discountIds(billingObject);

    await rpc({
      target_event_id: String(event.id),
      target_event_type: String(event.type),
      target_event_created: Number(event.created || 0),
      target_customer_id: objectId(billingObject.customer, 'cus_'),
      target_subscription_id: objectId(billingObject.id, 'sub_'),
      target_price_id: objectId(item?.price, 'price_'),
      target_status: String(billingObject.status || 'incomplete'),
      target_user_id: userId,
      target_email_hash: pendingEmailHash,
      target_period_end: Number(billingObject.current_period_end || item.current_period_end || 0),
      target_cancel_at_period_end: billingObject.cancel_at_period_end === true,
      target_promotion_code_id: discount.promotionCodeId || null,
      target_coupon_id: discount.couponId || null,
    });
    return Response.json({ received: true });
  } catch {
    return new Response('webhook processing failed', { status: 500 });
  }
});
