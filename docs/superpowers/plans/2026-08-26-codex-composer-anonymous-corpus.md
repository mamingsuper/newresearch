# Codex Composer and Public Product Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved Codex-style composer, transient research attachments, anonymous preview, real corpus browser, anonymous program submission, and guest-to-Pro checkout claim flow.

**Architecture:** Browser UI talks only to allowlisted Supabase Edge Functions. New private SQL tables hold expiring attachment text, one-time anonymous usage, and pending Stripe entitlements; `public.papers` remains backend-only. New behavior is isolated in shared validators/handlers so Node tests can exercise real request contracts without external services.

**Tech Stack:** React 19, TypeScript, Vite, Supabase Edge Functions/Deno, PostgreSQL/RLS, Stripe Checkout/webhooks, Node test runner, `unpdf` serverless PDF extraction.

**Spec:** `docs/superpowers/specs/2026-08-26-codex-composer-anonymous-corpus-design.md`

## Global Constraints

- Preserve the current Bauhaus visual system and responsive sizing.
- Never expose service-role, OpenAI, Apodex, Stripe, or HMAC secrets.
- Keep `public.papers` inaccessible to `anon` and `authenticated` roles.
- PDF/Markdown/TXT only; 6 MiB per file; one anonymous attachment; three authenticated attachments.
- Do not commit automatically because this worktree already contains user-owned uncommitted productization changes.

---

### Task 1: Product access policy and Codex-style composer

**Files:**
- Create: `frontend/src/lib/analysis-policy.ts`
- Create: `frontend/src/components/AnalysisComposer.tsx`
- Modify: `frontend/src/pages/NewAnalysis.tsx`
- Modify: `frontend/src/context/AppContext.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/index.css`
- Test: `tests/analysis-product-policy.test.mjs`

**Interfaces:**
- Produces `analysisAccessFor(user)` with `matchCounts`, `maxAttachments`, and anonymous/free/pro quota labels.
- Produces `validateAnalysisAttachment(file)` for client-side preflight and `AnalysisAttachment`/extended `AnalysisOptions` types.
- `AnalysisComposer` consumes app policy and emits idea, files, model, evidence depth, consent, and submit.

- [ ] Write policy tests proving anonymous=5/one file, Free=10/three files, Pro=20/100/three files, and invalid extension/oversize rejection.
- [ ] Run `node --test tests/analysis-product-policy.test.mjs` and verify the missing module/exports fail.
- [ ] Implement the minimal policy module and rerun until green.
- [ ] Replace inline radio cards with the composer, attachment chips, file picker, accessible popup menu, and anonymous submit path.
- [ ] Run `npm run frontend:typecheck` and the policy test.

### Task 2: Transient attachment extraction and anonymous analysis

**Files:**
- Create: `supabase/functions/_shared/analysis-attachments.ts`
- Create: `supabase/functions/extract-analysis-attachment/index.ts`
- Modify: `supabase/functions/_shared/idea-radar.ts`
- Modify: `frontend/src/adapters/analysis.ts`
- Create: `supabase/migrations/202608260001_anonymous_analysis_attachments.sql`
- Test: `tests/analysis-attachment-edge.test.mjs`
- Test: `tests/anonymous-analysis-contract.test.mjs`

**Interfaces:**
- `handleAttachmentRequest(req, dependencies)` validates multipart input and returns `{attachmentId,name,kind,characters,expiresAt}`.
- `analyze-idea` accepts `anonymousId` and `attachmentIds`; anonymous default requests are fixed to five matches.
- SQL RPCs atomically consume one anonymous preview and service-only attachment text.

- [ ] Write request-handler tests for valid Markdown, PDF magic validation, size/type errors, ownership, and attachment limits.
- [ ] Run both focused tests and verify expected failures.
- [ ] Implement shared handler, Deno `unpdf` adapter, actionable scanned-PDF error, migration, and frontend upload adapter.
- [ ] Extend analysis authorization so missing JWT uses the anonymous one-time RPC while authenticated behavior remains unchanged.
- [ ] Add consumed attachment text to the analysis prompt as delimited untrusted reference material and delete it after use.
- [ ] Run focused tests, `npm run frontend:typecheck`, and `npm run check`.

### Task 3: Real APSA/ICA corpus browser

**Files:**
- Create: `supabase/functions/_shared/corpus-library-core.ts`
- Create: `supabase/functions/corpus-library/index.ts`
- Create: `supabase/migrations/202608260002_corpus_library_rpc.sql`
- Modify: `frontend/src/adapters/conferences.ts`
- Modify: `frontend/src/pages/ConferenceLibrary.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/index.css`
- Test: `tests/corpus-library-edge.test.mjs`
- Modify: `tests/conference-library.test.mjs`

**Interfaces:**
- `GET corpus-library?conference=apsa-2026&q=polarization&page=1` returns collection summaries plus allowlisted paper records and pagination.
- `conferences.list({conference,query,page})` maps the Edge response without direct table access.

- [ ] Write handler tests for defaults, validation, pagination, allowlisted output, and no service-key leakage.
- [ ] Run focused corpus tests and verify failure against the current direct-table adapter.
- [ ] Implement service-only SQL projection and Edge handler.
- [ ] Build collection cards, search/filter controls, paper list, loading/empty/error states, and pagination.
- [ ] Run focused tests and frontend typecheck.

### Task 4: Anonymous program submission

**Files:**
- Modify: `supabase/functions/submit-program/index.ts`
- Modify: `frontend/src/adapters/programs.ts`
- Modify: `frontend/src/pages/SubmitProgram.tsx`
- Create: `supabase/migrations/202608260003_anonymous_program_submissions.sql`
- Modify: `tests/submit-program-contract.test.mjs`

**Interfaces:**
- Signed-in JSON/storage flow remains supported.
- Signed-out `multipart/form-data` accepts metadata, contact email, and optional validated file; URL-only requests may use JSON.
- `program_submissions.user_id` becomes nullable and `submitter_email_hash` records only a normalized-email hash.

- [ ] Add failing request tests for anonymous URL success, required email, malformed file, rate limit, and unchanged authenticated ownership.
- [ ] Implement nullable-owner SQL/RPC and anonymous request handling with service-side private upload.
- [ ] Remove the sign-in wall and add the contact-email field and anonymous privacy copy.
- [ ] Run submit-program tests and frontend typecheck.

### Task 5: Guest checkout and entitlement claim

**Files:**
- Modify: `supabase/functions/create-checkout-session/index.ts`
- Modify: `supabase/functions/stripe-webhook/index.ts`
- Modify: `supabase/functions/billing-status/index.ts`
- Modify: `frontend/src/adapters/billing.ts`
- Modify: `frontend/src/components/PaywallModal.tsx`
- Create: `supabase/migrations/202608260004_pending_stripe_entitlements.sql`
- Modify: `tests/billing-membership.test.mjs`
- Modify: `tests/promotion-code-checkout.test.mjs`

**Interfaces:**
- `billing.checkout(email?)` allows a guest email or the current authenticated user.
- Stripe subscription metadata carries `pending_email_hash`; webhook stores it without raw email.
- `billing-status` claims a matching pending entitlement after verifying JWT email.

- [ ] Write failing tests for validated guest email, pending hash metadata, webhook persistence, and verified-email claim.
- [ ] Implement guest Checkout Session creation while preserving authenticated customer reuse and promotion codes.
- [ ] Implement pending webhook persistence and atomic claim migration/RPC.
- [ ] Add guest email capture to the paywall and actionable success/error states.
- [ ] Run billing tests and frontend typecheck.

### Task 6: Full verification and preview

**Files:**
- Modify as required by failures only.

**Interfaces:**
- Produces a buildable Pages frontend and a localhost preview on port 8443.

- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Run `npm run frontend:typecheck`.
- [ ] Run `npm run pages:build` and `npm run pages:budget`.
- [ ] Review `git diff --check` and the final scoped diff for secret exposure or accidental unrelated changes.
- [ ] Start the approved local preview command and visually inspect desktop/mobile, light/dark, model menu, attachment chips, corpus library, and anonymous submit/paywall states.
