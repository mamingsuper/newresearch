# Research Frontier Radar MVP Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable, zero-runtime-dependency Node.js MVP that accepts a social-science idea, retrieves conference-paper evidence, and returns a structured research-frontier report in mock mode or live Supabase/OpenAI mode.

**Architecture:** A Node.js 22 HTTP server serves a browser-native interface and a validated `/api/analyze` endpoint. Framework-neutral interfaces isolate retrieval, analysis, and conference ingestion. Supabase Postgres with pgvector is the canonical live datastore, while deterministic local implementations keep the project runnable and testable without credentials.

**Tech Stack:** Node.js 22 built-in HTTP/fetch/test APIs, browser HTML/CSS/JavaScript, Supabase PostgREST/RPC, OpenAI Responses and Embeddings REST APIs, Tavily REST API, PostgreSQL/pgvector.

**Spec:** `docs/superpowers/specs/2026-08-21-research-frontier-radar-design.md`

## Global Constraints

- Default runtime mode is `mock`; live mode must be explicitly selected with `APP_MODE=live`.
- Never persist user ideas by default and never log raw idea text.
- OpenAI Responses API calls must set `store: false`.
- Reports may only claim corpus-scoped findings and must never claim global novelty.
- All cited report items must reference paper IDs returned by the retriever.
- Source URLs and retrieval provenance are required for every normalized paper.
- Zero runtime dependencies in the first vertical slice.
- Neo4j, Cognee, GraphRAG, accounts, payments, and scheduled crawling are out of scope.

---

### Task 1: Repository baseline and isolated branch

**Files:** `.gitignore`, `package.json`, `.env.example`, design and plan documents.

- [x] Initialize `main`, commit the approved design and plan, add `.worktrees/` to `.gitignore`.
- [x] Create isolated worktree branch `feat/mvp-vertical-slice`.
- [x] Run `npm test` and confirm the empty Node test baseline passes.

### Task 2: Canonical data model and source adapters

**Files:** `src/domain/schema.mjs`, `src/ingestion/normalizers.mjs`, `tests/schema.test.mjs`, `tests/normalizers.test.mjs`.

- [x] Write failing tests for required provenance, report paper references, APSA normalization, and ICA normalization.
- [x] Run tests and observe expected missing-module failures.
- [x] Implement validation and normalization with no inferred affiliations or missing source URLs.
- [x] Run tests and commit.

### Task 3: Credential-free retrieval and analysis

**Files:** `src/fixtures/sample-papers.mjs`, `src/retrieval/local-retriever.mjs`, `src/analysis/mock-analyzer.mjs`, corresponding tests.

- [x] Write a failing retrieval ranking test using generative-AI/political-trust and unrelated papers.
- [x] Implement deterministic weighted token retrieval and evidence excerpts.
- [x] Write a failing conservative-report test.
- [x] Implement a mock analyzer whose claims are corpus scoped and whose suggestions are labeled as inference.
- [x] Run tests and commit.

### Task 4: Pipeline and HTTP application

**Files:** `src/pipeline/analyze-idea.mjs`, `src/app/create-app.mjs`, `src/server.mjs`, corresponding tests.

- [x] Write failing tests for minimum idea length, empty retrieval short-circuiting, valid report references, HTTP 400, HTTP 200, and health endpoint.
- [x] Implement injected orchestration and a bounded JSON-body HTTP server without logging raw idea text.
- [x] Run tests and commit.

### Task 5: Browser workbench

**Files:** `public/index.html`, `public/app.js`, `public/styles.css`, static-serving tests.

- [x] Write a failing static smoke test for the idea input, disclosure, report mount, and safe source-link behavior.
- [x] Implement an accessible research-idea form, example input, loading/error states, and structured report renderer using DOM APIs rather than unsafe HTML interpolation.
- [x] Run tests and commit.

### Task 6: Supabase schema and live retrieval

**Files:** `supabase/migrations/202608210001_initial_schema.sql`, `src/retrieval/supabase-retriever.mjs`, corresponding tests.

- [x] Write failing injected-client tests for a 512-dimensional embedding request and Supabase RPC payload.
- [x] Implement OpenAI embeddings and Supabase RPC clients with server-only credentials.
- [x] Add tables, provenance, GIN/HNSW indexes, and reciprocal-rank-fusion RPC.
- [x] Add migration smoke tests, run all tests, and commit.

### Task 7: OpenAI structured analysis and Tavily discovery

**Files:** `src/analysis/openai-analyzer.mjs`, `src/tavily/client.mjs`, `src/runtime/services.mjs`, corresponding tests.

- [x] Write failing tests for `store: false`, JSON-schema response format, paper-ID grounding, Tavily auth, safe crawl defaults, and non-2xx errors.
- [x] Implement raw REST adapters with injected `fetch`.
- [x] Wire explicit mock/live service construction; never silently fall back from live to mock.
- [x] Run tests and commit.

### Task 8: Snapshot importer, CI, and documentation

**Files:** `scripts/import-snapshot.mjs`, `.github/workflows/ci.yml`, `README.md`, importer tests.

- [x] Write failing subprocess tests for APSA NDJSON output and unsupported source failure.
- [x] Implement import without printing abstracts.
- [x] Document mock quickstart, live variables, Supabase migration, ICA/APSA import, Tavily source lifecycle, privacy, and deferred GraphRAG.
- [x] Add Node 22 CI running `npm test`, `npm run check`, and `npm run build`.
- [x] Run complete verification and commit.

### Task 9: Public-endpoint and evidence-boundary hardening

**Files:** `src/pipeline/analyze-idea.mjs`, `src/analysis/openai-analyzer.mjs`, `src/app/rate-limiter.mjs`, `src/app/create-app.mjs`, `src/server.mjs`, `supabase/migrations/202608210001_initial_schema.sql`, corresponding tests and documentation.

- [x] Write failing tests proving that retrieved metadata replaces model-supplied titles, excerpts, conference labels, and URLs.
- [x] Write failing tests for prompt-injection instructions, output-token limits, fixed-window request limiting, current Supabase secret-key headers, and database RLS/grants.
- [x] Implement canonical evidence hydration, bounded OpenAI output, process-local request limiting with expired-bucket cleanup, current/legacy Supabase key compatibility, and backend-only database access.
- [x] Update configuration and deployment documentation with edge-limiting and secret-handling caveats.
- [x] Run focused tests before the final full verification.
