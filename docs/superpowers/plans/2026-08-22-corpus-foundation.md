# Corpus Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn reviewed ICA/APSA snapshots into an idempotent, searchable Supabase corpus with recoverable 512-dimensional embedding jobs and database-derived corpus metadata.

**Architecture:** Keep normalization, loading, embedding, and runtime metadata as separate modules. Supabase remains canonical; canonical text updates enqueue or refresh embedding jobs, and `/api/corpus` reads database-derived readiness through the existing server boundary.

**Tech Stack:** Node.js >=22.9, native fetch/test runner, Supabase Postgres + pgvector, OpenAI Embeddings REST API.

**Spec:** `docs/superpowers/specs/2026-08-21-corpus-foundation-design.md`

## Global Constraints

- Node.js remains `>=22.9.0`.
- Zero runtime npm dependencies.
- Supabase Postgres is canonical.
- Embeddings remain exactly 512 dimensions.
- Never log user ideas, abstracts, provider request bodies, or secrets.
- Mock mode remains offline-capable.
- No silent deletion of canonical papers.
- Every new production behavior must be covered by a failing test first.

---

### Task 1: Corpus migration contract

**Files:** Create `supabase/migrations/202608220001_corpus_foundation.sql` and `tests/corpus-foundation-migration.test.mjs`.

**Interfaces:** Produces `ingestion_runs`, `ingestion_rejections`, `embedding_jobs`, paper embedding metadata, `claim_embedding_jobs`, `complete_embedding_job`, `release_embedding_job`, and `get_corpus_stats`.

- [x] Write a failing migration contract test asserting tables, RLS, grants, dimension checks, job indexes, `SKIP LOCKED`, and all RPC names.
- [x] Run the targeted test and verify failure because the migration is absent.
- [x] Implement the migration with backend-only access and stale-hash guards.
- [x] Run the migration test and full suite.

### Task 2: Deterministic embedding text and corpus stats schema

**Files:** Create `src/corpus/embedding-text.mjs`, `src/corpus/stats.mjs`, and `tests/corpus-contracts.test.mjs`.

- [x] Write failing tests for stable text/hash and corpus stats validation.
- [x] Run targeted tests and verify expected missing-module failures.
- [x] Implement minimal deterministic contracts.
- [x] Run targeted and full tests.

### Task 3: Snapshot validation

**Files:** Create `src/corpus/validator.mjs`, `scripts/corpus-validate.mjs`, `tests/corpus-validator.test.mjs`; modify `package.json`.

- [x] Write failing tests for valid/rejected records, safe rejection output, single-conference enforcement, and SHA-256 report binding.
- [x] Run targeted tests and verify failure.
- [x] Implement validator by reusing ICA/APSA normalizers and writing canonical NDJSON plus safe report.
- [x] Run targeted and full tests.

### Task 4: Supabase corpus client and idempotent loader

**Files:** Create `src/supabase/corpus-client.mjs`, `src/corpus/loader.mjs`, `scripts/corpus-load.mjs`, `tests/corpus-loader.test.mjs`; modify `package.json`.

- [x] Write failing tests for inserted/unchanged/changed decisions, changed embedding input invalidation, and safe run failure behavior.
- [x] Run targeted tests and verify failure.
- [x] Implement focused REST/RPC methods and loader orchestration.
- [x] Run targeted and full tests.

### Task 5: Recoverable embedding worker

**Files:** Create `src/corpus/embedding-worker.mjs`, `scripts/corpus-embed.mjs`, `tests/embedding-worker.test.mjs`; modify `package.json`.

- [x] Write failing tests for successful 512-vector completion, transient retry, terminal failure, and stale input hash protection.
- [x] Run targeted tests and verify failure.
- [x] Implement worker without persisting provider response bodies.
- [x] Run targeted and full tests.

### Task 6: Dynamic corpus metadata API

**Files:** Modify `src/runtime/services.mjs`, `src/app/create-app.mjs`; create `tests/corpus-api.test.mjs`, `scripts/corpus-stats.mjs`; modify `package.json`.

- [x] Write failing route and live-service tests.
- [x] Run targeted tests and verify failure.
- [x] Implement the corpus stats service/cache and endpoint.
- [x] Run targeted and full tests.

### Task 7: Documentation and final verification

**Files:** Modify `README.md`, `.env.example`, this plan.

- [x] Document exact validate/load/embed/stats workflow and required server secrets.
- [x] Run `npm test`.
- [x] Run `npm run check`.
- [x] Run `npm run build`.
- [x] Run `git diff --check`.
- [x] Review diff for secrets, raw abstract logging, and accidental browser credentials.
