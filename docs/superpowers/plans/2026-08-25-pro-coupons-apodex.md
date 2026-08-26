# Pro Coupons and SUPER Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved React workspace as the production frontend with real Supabase/Stripe integration, cardless promotion-code Pro activation, server-enforced model/evidence-depth entitlements, and complete cited Apodex deep-research jobs.

**Architecture:** Keep Supabase Edge Functions and private SQL RPCs as the security boundary. Make the React/Vite app the single static Pages client, use the existing OpenAI path synchronously for default analysis, and use durable private jobs plus Apodex Responses background mode for SUPER research.

**Tech Stack:** React 19, TypeScript 5.7, Vite 8, Tailwind CSS 4, Supabase JS 2.112.3, Supabase Postgres/Edge Functions, Stripe Checkout/Webhooks, Apodex Responses API, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-25-pro-coupons-apodex-design.md`

## Global Constraints

- Free users receive one default analysis per UTC day and exactly 10 retrieved papers.
- Pro users receive unlimited default analyses, 20/100 evidence depth, and five accepted SUPER jobs per UTC month.
- Stripe owns promotion codes; no raw code is stored in browser or Supabase.
- A zero-total 100% promotion-code checkout must not require a card.
- `APODEX_API_KEY`, Stripe secrets, OpenAI keys, service-role keys, and rate-limit keys never enter source, logs, or Pages artifacts.
- SUPER returns complete final output plus canonical corpus and provider web sources, never hidden chain-of-thought.
- Existing public library, private workspace, bilingual, dark-mode, responsive, accessibility, and Pages subpath behavior remain functional.

---

### Task 1: Private entitlement and job schema

**Files:**
- Create: `supabase/migrations/202608250001_super_research_jobs.sql`
- Create: `tests/super-research-migration.test.mjs`

**Interfaces:**
- Produces: RPC `get_product_entitlement_status(target_user_id uuid)` returning plan/default remaining/SUPER remaining/limit.
- Produces: RPC `authorize_analysis_request(target_user_id uuid, target_model_key text, target_match_count integer, target_client_request_id uuid)` returning allowed/error/normalized model/count/job id.
- Produces: RPCs `get_analysis_job`, `set_analysis_job_provider`, `complete_analysis_job`, and `fail_analysis_job` scoped by verified user id.

- [x] **Step 1: Write the failing migration contract test**

```js
test('SUPER migration keeps jobs private and enforces monthly quota', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /private\.super_usage_monthly/i);
  assert.match(sql, /private\.analysis_jobs/i);
  assert.match(sql, /unique\s*\(user_id,\s*client_request_id\)/i);
  assert.match(sql, /authorize_analysis_request/i);
  assert.match(sql, /super_monthly_limit[^\n]*5/i);
  assert.match(sql, /revoke all[\s\S]*anon, authenticated/i);
});
```

- [x] **Step 2: Run the focused test and verify it fails because the migration is absent**

Run: `node --test tests/super-research-migration.test.mjs`

Expected: FAIL with `ENOENT` for `202608250001_super_research_jobs.sql`.

- [x] **Step 3: Add tables, constraints, indexes, RLS/revokes, and atomic RPCs**

The authorization RPC must lock on `target_user_id`, normalize free count to 10, reject free SUPER, reject invalid Pro choices, reuse an existing `client_request_id`, and increment SUPER only on the first accepted SUPER request.

```sql
if requested_model = 'super_apodex' and not pro_enabled then
  return query select false, 'PRO_REQUIRED', plan_name, requested_model, requested_count, null::uuid;
elsif requested_model = 'super_apodex' and super_used >= 5 then
  return query select false, 'SUPER_LIMIT_REACHED', plan_name, requested_model, requested_count, null::uuid;
end if;
```

- [x] **Step 4: Run migration and existing membership contract tests**

Run: `node --test tests/super-research-migration.test.mjs tests/billing-membership.test.mjs tests/user-workspace-migration.test.mjs`

Expected: PASS.

### Task 2: Stripe cardless promotion-code Checkout

**Files:**
- Modify: `supabase/functions/create-checkout-session/index.ts`
- Modify: `supabase/functions/stripe-webhook/index.ts`
- Modify: `supabase/migrations/202608250001_super_research_jobs.sql`
- Create: `tests/promotion-code-checkout.test.mjs`

**Interfaces:**
- Produces: hosted Checkout Session with promotion-code entry and conditional payment method collection.
- Produces: webhook persistence based on the fetched subscription object for `checkout.session.completed`.

- [x] **Step 1: Write failing Checkout and webhook contract tests**

```js
assert.match(checkout, /allow_promotion_codes['"]?\s*[:,]\s*['"]true/);
assert.match(checkout, /payment_method_collection['"]?\s*[:,]\s*['"]if_required/);
assert.match(webhook, /subscriptions\/\$\{encodeURIComponent/);
assert.doesNotMatch(webhook, /target_status:String\(object\.status\|\|'incomplete'\)/);
```

- [x] **Step 2: Run the focused test and verify current code fails**

Run: `node --test tests/promotion-code-checkout.test.mjs`

Expected: FAIL because Checkout lacks both parameters and the webhook forwards Session status.

- [x] **Step 3: Add Checkout parameters and subscription retrieval**

For Checkout completion, fetch `subscriptions/{session.subscription}?expand[]=items.data.price&expand[]=discounts.promotion_code`; pass only safe discount metadata into the billing RPC. Keep signature verification before all parsing and Stripe calls.

- [x] **Step 4: Run billing tests**

Run: `node --test tests/promotion-code-checkout.test.mjs tests/billing-membership.test.mjs`

Expected: PASS.

### Task 3: Server-side analysis option enforcement

**Files:**
- Modify: `supabase/functions/_shared/idea-radar.ts`
- Modify: `supabase/functions/analyze-idea/index.ts`
- Create: `tests/analysis-options.test.mjs`

**Interfaces:**
- Consumes: `authorize_analysis_request` from Task 1.
- Produces: request contract `{ idea, model, matchCount, clientRequestId }`.
- Produces: default response `{ data: report }` or SUPER response `{ data: { jobId, status }, meta }` with HTTP 202.

- [x] **Step 1: Write failing request-policy tests**

Test the exported pure parser with free/default/100, free/SUPER/10, Pro/default/20, Pro/SUPER/100, invalid model, and invalid count.

```js
assert.deepEqual(enforceAnalysisOptions({ plan: 'free', model: 'default', matchCount: 100 }), { model: 'default', matchCount: 10 });
assert.throws(() => enforceAnalysisOptions({ plan: 'free', model: 'super_apodex', matchCount: 10 }), /PRO_REQUIRED/);
```

- [x] **Step 2: Run the focused test and verify the export is missing**

Run: `node --test tests/analysis-options.test.mjs`

Expected: FAIL because option enforcement is not implemented.

- [x] **Step 3: Parse validated options and pass authorized `match_count` into hybrid retrieval**

Do not accept floating point counts, aliases, or arbitrary model names. Call the entitlement RPC before provider work. Preserve request-id idempotency.

- [x] **Step 4: Run default-analysis and Edge contract tests**

Run: `node --test tests/analysis-options.test.mjs tests/edge-function-contract.test.mjs tests/analyze-idea.test.mjs`

Expected: PASS with assertions updated from the old fixed count to explicit policy coverage.

### Task 4: Apodex background research adapter

**Files:**
- Create: `supabase/functions/_shared/apodex-research.ts`
- Create: `tests/apodex-research.test.mjs`

**Interfaces:**
- Produces: `createApodexResearch(input, fetchImpl?) -> { providerResponseId, status }`.
- Produces: `pollApodexResearch(id, fetchImpl?) -> { status, reportMarkdown, webSources, researchActions }`.
- Produces: `buildDeepResearchPrompt({ idea, papers }) -> string`.

- [x] **Step 1: Write failing adapter tests with injected fetch**

```js
assert.equal(request.model, 'apodex-1-1-deep-research');
assert.equal(request.background, true);
assert.equal(request.stream, false);
assert.match(request.input, /Corpus source \[C1\]/);
assert.match(result.reportMarkdown, /Complete research memo/);
assert.deepEqual(result.webSources, [{ title: 'Source', url: 'https://example.org/a' }]);
```

Also test 429 `Retry-After`, 5xx bounded retries, malformed URLs, incomplete output, and absence of secret/provider-body logging.

- [x] **Step 2: Run focused tests and verify module absence**

Run: `node --test tests/apodex-research.test.mjs`

Expected: FAIL with module-not-found.

- [x] **Step 3: Implement prompt, create, poll, normalization, and retry helpers**

Use `https://api.apodex.ai/v1/responses`, `APODEX_API_KEY`, and `APODEX_MODEL || 'apodex-1-1-deep-research'`. Preserve all final message text. Extract only safe action summaries and validated HTTP(S) citations.

- [x] **Step 4: Run adapter tests**

Run: `node --test tests/apodex-research.test.mjs`

Expected: PASS.

### Task 5: Durable SUPER job endpoints

**Files:**
- Modify: `supabase/functions/_shared/idea-radar.ts`
- Create: `supabase/functions/analysis-job-status/index.ts`
- Create: `tests/analysis-job-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 job RPCs and Task 4 provider adapter.
- Produces: authenticated `GET analysis-job-status?id=<uuid>` response matching the spec.

- [x] **Step 1: Write failing Edge contract tests**

```js
assert.match(statusSource, /authenticateRequest/);
assert.match(statusSource, /get_analysis_job/);
assert.match(statusSource, /pollApodexResearch/);
assert.match(statusSource, /cache-control[^\n]*no-store/i);
assert.doesNotMatch(statusSource, /console\.(log|error|warn)/);
```

- [x] **Step 2: Run the focused test and verify the endpoint is absent**

Run: `node --test tests/analysis-job-contract.test.mjs`

Expected: FAIL with `ENOENT`.

- [x] **Step 3: Start jobs in analyze-idea and implement owner-scoped polling**

Store the retrieved corpus snapshot before calling Apodex. Persist provider id after creation. On provider completion, persist the complete report and normalized sources before responding. Return safe retryable states for transient errors.

- [x] **Step 4: Run all Edge contracts**

Run: `node --test tests/analysis-job-contract.test.mjs tests/analysis-options.test.mjs tests/edge-function-contract.test.mjs`

Expected: PASS.

### Task 6: Move the approved React app into production and add real runtime/auth/billing

**Files:**
- Create: `frontend/` from the approved `/Users/ming.ma/Downloads/Website Frontend Design` source, excluding `dist`, `node_modules`, and Figma-only metadata.
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/build-pages.mjs`
- Modify: `.github/workflows/pages.yml`
- Create: `frontend/src/adapters/runtime.ts`
- Create: `frontend/src/adapters/supabase.ts`
- Modify: `frontend/src/adapters/auth.ts`
- Modify: `frontend/src/adapters/billing.ts`
- Modify: `frontend/src/context/AppContext.tsx`
- Create: `tests/react-production-integration.test.mjs`

**Interfaces:**
- Produces: Vite `frontend/dist` copied into `pages-dist` with generated `config.js`.
- Produces: restored `UserState` from Supabase auth plus billing-status.

- [x] **Step 1: Write failing integration contract test**

Assert Vite scripts exist, adapters import Supabase rather than mocks, BrowserRouter has the Pages basename, and the Pages builder scans the compiled artifact for all secret names including Apodex.

- [x] **Step 2: Run the focused test and verify `frontend/` is absent**

Run: `node --test tests/react-production-integration.test.mjs`

Expected: FAIL.

- [x] **Step 3: Copy source through a reviewable patch/import, install pinned dependencies, and wire runtime/auth/billing**

Use `createClient(publicUrl, publishableKey, { auth: { persistSession: true, detectSessionInUrl: true } })`. Checkout and portal accept only `https://checkout.stripe.com` and `https://billing.stripe.com` redirects.

- [x] **Step 4: Build and run integration/deployment tests**

Run: `npm run frontend:build && node --test tests/react-production-integration.test.mjs tests/pages-deployment.test.mjs tests/pages-budget.test.mjs`

Expected: PASS.

### Task 7: Real analysis, model/count controls, progress, and complete results

**Files:**
- Modify: `frontend/src/adapters/analysis.ts`
- Modify: `frontend/src/pages/NewAnalysis.tsx`
- Modify: `frontend/src/pages/AnalysisProgress.tsx`
- Modify: `frontend/src/pages/AnalysisResults.tsx`
- Modify: `frontend/src/components/PaywallModal.tsx`
- Modify: `frontend/src/i18n/en.ts`
- Modify: `frontend/src/i18n/zh.ts`
- Modify: `frontend/src/index.css`
- Create: `tests/react-analysis-controls.test.mjs`

**Interfaces:**
- Consumes: real session token, billing entitlement, synchronous default report, and asynchronous SUPER job contract.
- Produces: `AnalysisOptions = { model: 'default'|'super_apodex'; matchCount: 10|20|100; clientRequestId: string }`.

- [x] **Step 1: Write failing UI contract tests**

Assert free locked SUPER copy, free fixed 10, Pro 20/100 choices, SUPER remaining display, job-id persistence, polling endpoint, complete Markdown rendering, corpus sources, and web sources.

- [x] **Step 2: Run the focused test and verify controls/contracts are absent**

Run: `node --test tests/react-analysis-controls.test.mjs`

Expected: FAIL.

- [x] **Step 3: Implement selectors and the complete default/SUPER flow**

Use native accessible controls styled within the approved Bauhaus system. Disable SUPER submission when remaining is zero. Keep the full provider text in state/session storage and render it without slicing.

- [x] **Step 4: Run UI contracts and build**

Run: `node --test tests/react-analysis-controls.test.mjs tests/accessibility-i18n.test.mjs && npm run frontend:build`

Expected: PASS.

### Task 8: Replace remaining workspace mocks and complete parity

**Files:**
- Modify: `frontend/src/adapters/papers.ts`
- Modify: `frontend/src/adapters/sessions.ts`
- Modify: `frontend/src/adapters/account.ts`
- Modify: `frontend/src/adapters/programs.ts`
- Modify: `frontend/src/pages/SavedPapers.tsx`
- Modify: `frontend/src/pages/Conversations.tsx`
- Modify: `frontend/src/pages/Account.tsx`
- Modify: `frontend/src/pages/SubmitProgram.tsx`
- Create: `tests/react-private-workspace.test.mjs`

**Interfaces:**
- Consumes: existing Supabase public workspace tables and deployed account/program Edge contracts.
- Produces: authenticated private lists, save/remove paper, save/delete session, export/delete account, program submission, and real loading/empty/error states.

- [x] **Step 1: Write failing no-mock and workspace contract tests**

```js
assert.doesNotMatch(appSources, /from\s+["']\.\.\/mocks\//);
assert.match(papersAdapter, /saved_papers/);
assert.match(sessionsAdapter, /analysis_sessions/);
assert.match(accountAdapter, /export-account/);
assert.match(accountAdapter, /delete-account/);
```

- [x] **Step 2: Run focused tests and verify mocks are still imported**

Run: `node --test tests/react-private-workspace.test.mjs`

Expected: FAIL.

- [x] **Step 3: Replace each mock adapter and remove runtime mock imports**

Every private query requires a live session. Unauthenticated pages show the approved sign-in explanation. Delete-account remains confirmation-gated and calls only the existing authenticated Edge endpoint.

- [x] **Step 4: Run workspace tests and production build**

Run: `node --test tests/react-private-workspace.test.mjs tests/private-workspace-isolation.test.mjs tests/account-lifecycle-functions.test.mjs && npm run frontend:build`

Expected: PASS.

### Task 9: Full verification, local preview, and deployment readiness

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Create: `docs/qa/2026-08-25-pro-super-completion-audit.md`

**Interfaces:**
- Produces: reproducible operator instructions and requirement-by-requirement evidence.

- [ ] **Step 1: Document secret names and Stripe coupon location without values**

Document `APODEX_API_KEY`, optional `APODEX_MODEL`, Stripe Dashboard coupon path, required webhook events, migration/function deployment order, and local public config setup.

- [ ] **Step 2: Run the complete local verification suite**

Run: `npm test && npm run check && npm run build && PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test npm run pages:build && npm run pages:budget`

Expected: every command exits 0; Pages artifact contains no secret-shaped values.

- [ ] **Step 3: Start the local Pages preview and run browser QA**

Run: `python3 -m http.server 8443 --directory pages-dist`

Expected: desktop and narrow viewport render; English/Chinese and light/dark work; auth, free locks, Pro controls, progress resume, full results, and source links are visually verified.

- [ ] **Step 4: Record the completion audit and remaining external deployment actions**

The audit maps every spec requirement to a passing test, source path, build artifact, or live response. It clearly separates verified local behavior from actions requiring the user's Supabase/Stripe secret dashboards.
