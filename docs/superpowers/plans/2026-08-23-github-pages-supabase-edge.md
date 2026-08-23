# GitHub Pages + Supabase Edge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Idea Radar on GitHub Pages with a live Supabase Edge backend that searches the existing 8,906-paper OpenAI embedding corpus and returns evidence-grounded reports.

**Architecture:** GitHub Pages serves only static HTML/CSS/JS. Public browser calls go to two Supabase Edge Functions: `corpus-status` for safe corpus metadata and `analyze-idea` for validation, anonymous rate limiting, OpenAI query embedding, hybrid Postgres retrieval, and structured OpenAI analysis. Production corpus and query embeddings use one explicit `text-embedding-3-small` / 512-dimensional contract.

**Tech Stack:** Node.js 22, browser HTML/CSS/JS, Supabase Postgres/pgvector/RPC, Supabase Edge Functions (Deno/TypeScript), OpenAI Embeddings + Responses API, GitHub Actions/Pages.

**Spec:** `docs/superpowers/specs/2026-08-23-github-pages-supabase-edge-design.md`

## Global Constraints

- Production embeddings: OpenAI `text-embedding-3-small`, exactly 512 dimensions.
- Analysis: `gpt-5-mini`, `max_output_tokens: 1800`, `store: false`, strict JSON schema.
- Maximum request body: 32 KiB; idea length after trim: 20–5000 characters.
- Maximum retrieved evidence records: 12.
- Public beta limits: 5 analysis requests/60 seconds and 30/3600 seconds per HMAC client hash.
- Allowed browser origins: `https://mamingsuper.github.io`, `http://localhost:3000`, `http://127.0.0.1:3000`.
- Raw ideas and raw network identifiers are never persisted in application/rate-limit storage or normal logs.
- No browser asset may contain OpenAI or Supabase privileged credentials.
- No global novelty claims; all conclusions remain corpus-scoped and source-grounded.

---

### Task 1: Restore the production OpenAI embedding contract

**Files:**
- Modify: `tests/corpus-loader.test.mjs`
- Modify: `tests/runtime-services.test.mjs`
- Modify: `tests/supabase-retriever.test.mjs`
- Modify: `src/corpus/loader.mjs`
- Modify: `src/runtime/services.mjs`
- Modify: `scripts/corpus-embed.mjs`
- Modify: `.env.example`
- Modify: `.github/workflows/embed-corpus.yml`

**Interfaces:**
- Produces: production job model `text-embedding-3-small`, dimensions `512`; live `createServices()` uses `OpenAIEmbeddingsClient`; corpus worker requires `OPENAI_API_KEY`.

- [ ] **Step 1: Write failing contract tests**

Change the loader test to require `text-embedding-3-small`; add a runtime-service assertion that the live retriever's embedding client is `OpenAIEmbeddingsClient` with model `text-embedding-3-small`; add an embeddings-client request test asserting OpenAI body `{model:'text-embedding-3-small', dimensions:512}`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/corpus-loader.test.mjs tests/runtime-services.test.mjs tests/supabase-retriever.test.mjs`

Expected: FAIL because current live runtime/loader use Nomic.

- [ ] **Step 3: Implement the production contract**

Use `OpenAIEmbeddingsClient` in live services and `corpus-embed.mjs`; queue new jobs with `text-embedding-3-small`; require `OPENAI_API_KEY`; update env/workflow copy so Nomic is no longer described or invoked as the production provider.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same focused command; expected PASS.

- [ ] **Step 5: Commit**

Commit message: `fix: restore production OpenAI embedding contract`.

### Task 2: Add corrective migration and anonymous beta rate limiting

**Files:**
- Create: `supabase/migrations/202608230002_pages_edge_beta.sql`
- Create: `tests/pages-edge-migration.test.mjs`

**Interfaces:**
- Produces: unfinished jobs retargeted to OpenAI 512d; `private.beta_rate_limit_buckets`; `public.consume_beta_rate_limit(client_hash text)` returning `allowed` and `retry_after_seconds`; service-role-only execution.

- [ ] **Step 1: Write the failing migration contract test**

Assert the migration contains the OpenAI retarget limited to pending/processing jobs, private rate-limit table, minute/hour bucket checks, 5/30 thresholds, two-hour cleanup, revokes from public/anon/authenticated, and grant to service_role.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/pages-edge-migration.test.mjs`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement migration**

Use fixed UTC bucket boundaries (`date_trunc('minute', now())`, `date_trunc('hour', now())`) and one PL/pgSQL transaction to lock/upsert both buckets, calculate retry-after, and clean old rows. Do not create any idea table.

- [ ] **Step 4: Run and verify GREEN**

Run the focused migration test; expected PASS.

- [ ] **Step 5: Apply migration to live Supabase and verify**

Apply through the Supabase migration action, then query only aggregate job model/status counts and rate-limit object metadata. Confirm completed 8,906 vectors are untouched.

- [ ] **Step 6: Commit**

Commit message: `feat: add beta rate limit and embedding contract migration`.

### Task 3: Build the public `analyze-idea` Edge Function

**Files:**
- Create: `supabase/functions/_shared/idea-radar.ts`
- Create: `supabase/functions/analyze-idea/index.ts`
- Create: `tests/edge-function-contract.test.mjs`

**Interfaces:**
- Consumes: `OPENAI_API_KEY`, `RATE_LIMIT_HMAC_KEY`, Supabase server environment; `hybrid_search_papers`, `get_corpus_stats`, `consume_beta_rate_limit` RPCs.
- Produces: `POST /functions/v1/analyze-idea -> {data: AnalysisReport}` and OPTIONS preflight.

- [ ] **Step 1: Write failing source-contract tests**

Assert exact CORS allowlist, 32 KiB/20–5000 validation, HMAC hashing before rate-limit RPC, `text-embedding-3-small` + 512, max retrieval 12, `gpt-5-mini`, `1800`, `store:false`, strict JSON schema, paper-ID validation, canonical field overwrite, safe/no-store errors, and no raw idea logging.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/edge-function-contract.test.mjs`

Expected: FAIL because Edge function source does not exist.

- [ ] **Step 3: Implement minimal shared Edge core and handler**

Use only Web APIs/fetch and Deno environment values. Browser invocation is public (`verify_jwt=false` at deployment), but all privileged RPCs use the Edge server credential. Do not expose provider response bodies.

- [ ] **Step 4: Run and verify GREEN**

Run focused test; expected PASS.

- [ ] **Step 5: Deploy function and run controlled live smoke**

Deploy `analyze-idea`; OPTIONS from the Pages origin must return valid CORS; malformed/short idea must return 400 without provider work; one harmless valid English request must return structured data.

- [ ] **Step 6: Commit**

Commit message: `feat: add public evidence analysis edge function`.

### Task 4: Build `corpus-status` Edge Function

**Files:**
- Create: `supabase/functions/corpus-status/index.ts`
- Extend: `tests/edge-function-contract.test.mjs`

**Interfaces:**
- Produces: `GET /functions/v1/corpus-status -> {data:{ready,paperCount,papersWithAbstract,embeddedPaperCount,pendingEmbeddingCount,failedEmbeddingCount,conferences}}` with max-age 60 and CORS.

- [ ] **Step 1: Add failing status contract test**

Require GET-only behavior, safe projection, public cache header, same CORS allowlist, and no internal job/rejection/credential fields.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/edge-function-contract.test.mjs`

Expected: FAIL because `corpus-status` does not exist.

- [ ] **Step 3: Implement the minimal status handler**

Call `get_corpus_stats`, project only the approved public fields, return `Cache-Control: public, max-age=60`, and share the same exact CORS allowlist.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same focused command; expected PASS.

- [ ] **Step 5: Deploy and verify live status**

Live result must report `paperCount=8906`, `embeddedPaperCount=8906`, `pendingEmbeddingCount=0`, `failedEmbeddingCount=0`, `ready=true`.

- [ ] **Step 6: Commit**

Commit message: `feat: expose public corpus status edge function`.

### Task 5: Make the approved UI GitHub-Pages-aware and add deployment workflow

**Files:**
- Integrate PR #5 files: `public/index.html`, `public/styles.css`, `public/app.js`, `tests/static-ui.test.mjs`
- Create: `public/config.js`
- Create: `scripts/build-pages.mjs`
- Create: `tests/pages-deployment.test.mjs`
- Create: `.github/workflows/pages.yml`
- Modify: `package.json`

**Interfaces:**
- Produces: Pages-safe static artifact `pages-dist/`; browser resolves Edge API via `window.__IDEA_RADAR_CONFIG__.apiBaseUrl` with same-origin local fallback.

- [ ] **Step 1: Write failing Pages deployment tests**

Require relative `./styles.css`, `./config.js`, `./app.js`; safe public config containing only Edge base URL; app routing to `analyze-idea` and `corpus-status`; `.nojekyll`; no secret-shaped values; Pages workflow actions `configure-pages@v5`, `upload-pages-artifact@v4`, `deploy-pages@v4` and correct permissions.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/static-ui.test.mjs tests/pages-deployment.test.mjs`

Expected: FAIL on root-absolute paths and same-origin-only API.

- [ ] **Step 3: Implement Pages-safe browser/build/workflow**

Add `pages:build` script. `build-pages.mjs` copies only public static assets into `pages-dist/`, writes `.nojekyll`, and rejects root-absolute app assets or credential patterns.

- [ ] **Step 4: Run focused tests + `npm run pages:build` and verify GREEN**

- [ ] **Step 5: Commit**

Commit message: `feat: deploy Idea Radar with GitHub Pages`.

### Task 6: Integrate, publish, and verify the live beta

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-23-github-pages-supabase-edge-design.md` status from Approved to Implemented only after all acceptance criteria pass.

**Interfaces:**
- Produces: public `https://mamingsuper.github.io/newresearch/` and live Edge API.

- [ ] **Step 1: Run full local verification**

Run: `npm test && npm run check && npm run build && npm run pages:build` plus `git diff --check`.

- [ ] **Step 2: Review remote diff and create implementation PR**

No Critical/Important issue may remain. Confirm no secret string was added.

- [ ] **Step 3: Wait for GitHub CI to pass, then merge to `main`**

Use squash merge only after current head SHA and CI success are rechecked.

- [ ] **Step 4: Verify GitHub Pages deployment**

Confirm `/newresearch/`, `styles.css`, `config.js`, and `app.js` return 200 and page shows live corpus count.

- [ ] **Step 5: Run live English and Chinese smoke tests**

English: AI transparency/political trust idea. Chinese: a 20+ character social-science idea. Verify grounded report or corpus-scoped abstention, canonical source links, and no global novelty claim.

- [ ] **Step 6: Verify rate limit and database safety**

Use controlled invalid/valid requests as needed without exhausting the hourly beta budget; query aggregate rate-limit rows only; confirm raw ideas/IPs are absent. Re-run Supabase security/performance advisors.

- [ ] **Step 7: Document the public URL and deployment operation**

Update README with public beta URL, architecture, local fallback, production OpenAI embedding contract, and deployment notes.

- [ ] **Step 8: Final verification**

Freshly re-run repository verification, check Pages workflow/deployment conclusion, live corpus stats (8,906/8,906), Edge CORS, and both smoke results before declaring deployment complete.
