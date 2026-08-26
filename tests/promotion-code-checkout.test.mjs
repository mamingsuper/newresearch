import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const checkoutUrl = new URL('../supabase/functions/create-checkout-session/index.ts', import.meta.url);
const webhookUrl = new URL('../supabase/functions/stripe-webhook/index.ts', import.meta.url);
const migrationUrl = new URL('../supabase/migrations/202608250001_super_research_jobs.sql', import.meta.url);

test('Stripe Checkout accepts promotion codes and skips card collection when nothing is due', async () => {
  const source = await readFile(checkoutUrl, 'utf8');

  assert.match(source, /allow_promotion_codes['"]?\s*:\s*['"]true['"]/);
  assert.match(source, /payment_method_collection['"]?\s*:\s*['"]if_required['"]/);
  assert.match(source, /mode\s*:\s*['"]subscription['"]/);
  assert.match(source, /client_reference_id/);
});

test('Checkout completion persists the fetched subscription state instead of Session complete', async () => {
  const source = await readFile(webhookUrl, 'utf8');

  assert.match(source, /checkout\.session\.completed/);
  assert.match(source, /subscriptions\/\$\{encodeURIComponent\(subscriptionId\)\}/);
  assert.match(source, /billingObject\.status/);
  assert.match(source, /billingObject\?\.items/);
  assert.match(source, /promotion_code/i);
  assert.doesNotMatch(source, /target_status:String\(object\.status\|\|'incomplete'\)/);
  assert.match(source, /STRIPE_WEBHOOK_SECRET/);
  assert.match(source, /stripe-signature/);
});

test('application stores only Stripe discount identifiers, never customer-facing coupon text', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /stripe_promotion_code_id/i);
  assert.match(migration, /stripe_coupon_id/i);
  assert.doesNotMatch(migration, /promotion_code_value|coupon_code|raw_coupon/i);
});
