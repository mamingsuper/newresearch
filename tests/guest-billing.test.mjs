import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('guest checkout accepts a bounded email and records only its hash in app metadata', async () => {
  const checkout = await readFile(new URL('../supabase/functions/create-checkout-session/index.ts', import.meta.url), 'utf8');
  assert.match(checkout, /customer_email/);
  assert.match(checkout, /pending_email_hash/);
  assert.match(checkout, /SHA-256/);
  assert.match(checkout, /consume_beta_rate_limit/);
  assert.match(checkout, /AUTH_REQUIRED/);
  assert.doesNotMatch(checkout, /metadata\]\[email\]/i);
});

test('webhooks park guest subscriptions by email hash and authenticated status claims them', async () => {
  const [webhook, status] = await Promise.all([
    readFile(new URL('../supabase/functions/stripe-webhook/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/billing-status/index.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(webhook, /pending_email_hash/);
  assert.match(webhook, /target_email_hash/);
  assert.match(status, /claim_pending_billing/);
  assert.match(status, /SHA-256/);
});

test('pending guest billing state is private, service-only, and atomically claimable', async () => {
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const name = (await readdir(directory)).find((file) => file.endsWith('_guest_billing_claim.sql'));
  assert.ok(name, 'guest billing migration is missing');
  const sql = await readFile(new URL(name, directory), 'utf8');
  assert.match(sql, /private\.pending_billing_claims/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /claim_pending_billing/i);
  assert.match(sql, /target_email_hash/i);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i);
});

test('paywall offers an email checkout before login', async () => {
  const [modal, adapter] = await Promise.all([
    readFile(new URL('../frontend/src/components/PaywallModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../frontend/src/adapters/billing.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(modal, /type="email"/);
  assert.match(modal, /billing\.createCheckout\(user \? undefined : email\)/);
  assert.match(adapter, /publicEdgeFetch/);
  assert.match(adapter, /email/);
});
