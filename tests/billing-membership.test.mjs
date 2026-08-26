import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { safeStripeUrl } from '../public/billing.js';

const migrationUrl = new URL('../supabase/migrations/202608240003_stripe_memberships.sql', import.meta.url);

test('membership migration keeps billing private and enforces one free analysis per UTC day', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of ['billing_customers', 'subscriptions', 'analysis_usage_daily', 'stripe_webhook_events']) {
    assert.match(sql, new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+private\\.${table}`, 'i'));
    assert.match(sql, new RegExp(`alter\\s+table\\s+private\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'));
  }
  assert.match(sql, /consume_analysis_entitlement/i);
  assert.match(sql, /used\s*>=\s*1/i);
  assert.match(sql, /status\s+in\s*\('active','trialing'\)/i);
  assert.match(sql, /process_stripe_billing_event/i);
  assert.match(sql, /stripe_webhook_events/i);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i);
});

test('billing Edge Functions authenticate users and Stripe webhooks verify signatures', async () => {
  const names = ['billing-status', 'create-checkout-session', 'create-portal-session', 'stripe-webhook'];
  const sources = await Promise.all(names.map((name) => readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8')));
  assert.match(sources[0], /get_analysis_entitlement_status/);
  assert.match(sources[0], /superRemaining/);
  assert.match(sources[0], /superMonthlyLimit/);
  assert.match(sources[1], /mode\s*:\s*['"]subscription['"]/);
  assert.match(sources[1], /STRIPE_PRICE_ID/);
  assert.match(sources[1], /client_reference_id/);
  assert.match(sources[2], /billing_portal\/sessions/);
  assert.match(sources[3], /STRIPE_WEBHOOK_SECRET/);
  assert.match(sources[3], /HMAC/);
  assert.match(sources[3], /stripe-signature/);
  assert.match(sources[3], /process_guest_stripe_billing_event/);
  assert.doesNotMatch(sources.join('\n'), /console\.(log|error|warn)/);
});

test('browser billing redirects only to Stripe-hosted HTTPS pages', () => {
  assert.equal(safeStripeUrl('https://checkout.stripe.com/c/pay/cs_test_123'), 'https://checkout.stripe.com/c/pay/cs_test_123');
  assert.equal(safeStripeUrl('https://billing.stripe.com/p/session/test'), 'https://billing.stripe.com/p/session/test');
  assert.equal(safeStripeUrl('https://stripe.example.com/phishing'), null);
  assert.equal(safeStripeUrl('javascript:alert(1)'), null);
});
