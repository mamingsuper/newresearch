# Research Frontier Radar

Research Frontier Radar helps social-science researchers compare an early-stage idea with recent conference-paper metadata and abstracts. It retrieves related work, explains *where* the overlap occurs, and proposes evidence-linked ways to differentiate the design.

It deliberately does **not** claim to prove global novelty. The strongest permitted conclusion is corpus scoped: “No direct match was found in the currently indexed conference corpus.”

## Current milestone

This repository contains a tested MVP vertical slice:

- a browser research-idea workbench;
- a dependency-free Node.js API server;
- deterministic mock mode that runs without credentials;
- canonical ICA 2026 and APSA 2026 normalization adapters;
- a Supabase Postgres/pgvector schema with hybrid keyword-vector retrieval;
- OpenAI Responses and Embeddings REST adapters;
- Tavily Search and bounded Crawl adapters;
- an NDJSON snapshot importer;
- privacy-aware logging, tests, CI, and deployment build output.

The bundled records are clearly labeled demonstration data. They are not presented as real conference papers.

## Quick start — no credentials

Requirements: Node.js 22.9 or newer.

```bash
cp .env.example .env
npm start
```

Open `http://localhost:3000` and use **Load an example**. `APP_MODE=mock` is the default, so no API keys or database are required.

Run verification:

```bash
npm test
npm run check
npm run build
```

The production-style build is written to `dist/` and can be started with:

```bash
cd dist
npm start
```

## Live architecture

```text
ICA/APSA snapshots + reviewed public conference pages
                         |
              normalizers and provenance
                         |
        Supabase Postgres + pgvector + FTS
                         |
             reciprocal-rank fusion
                         |
          OpenAI structured analysis
                         |
            evidence-grounded report
```

Supabase is the canonical source of truth. Model-derived interpretations never replace titles, abstracts, authors, or original source URLs.

### 1. Create the Supabase schema

Create a free Supabase project and apply:

```text
supabase/migrations/202608210001_initial_schema.sql
```

The migration creates:

- `conference_sources` and its review lifecycle;
- `crawl_runs` with provider/request provenance;
- canonical `papers` with a generated full-text document;
- 512-dimensional pgvector embeddings;
- GIN and HNSW indexes;
- `hybrid_search_papers`, which combines keyword and semantic ranks with reciprocal-rank fusion;
- row-level security and explicit backend-only grants for all corpus tables.

Keep `SUPABASE_SECRET_KEY` on the server only. Never expose it in browser JavaScript. The legacy `SUPABASE_SERVICE_ROLE_KEY` remains supported as a fallback for older projects.

### 2. Configure live services

Set these values in `.env` or the hosting environment:

```dotenv
APP_MODE=live
OPENAI_API_KEY=...
OPENAI_ANALYSIS_MODEL=gpt-5-mini
OPENAI_MAX_OUTPUT_TOKENS=1800
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
# Optional legacy fallback: SUPABASE_SERVICE_ROLE_KEY=...
CORPUS_CONFERENCES=ICA 2026,APSA 2026
CORPUS_PAPER_COUNT=0
RATE_LIMIT_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
```

Live mode is explicit. If a required credential is missing, startup fails rather than silently reverting to mock data. New Supabase secret keys are sent only in the `apikey` header; legacy JWT service-role keys retain bearer authentication compatibility.

The analysis request uses the OpenAI Responses API with JSON-schema output, `store: false`, and a configurable output-token ceiling. Retrieved paper IDs may guide model reasoning, but the server replaces model-supplied titles, conference labels, excerpts, and source URLs with canonical database values before responding. The embedding request asks for 512 dimensions to match the database migration.

## Import ICA and APSA snapshots

The importer accepts either a JSON array or an object with a `papers` array and writes canonical NDJSON.

APSA:

```bash
npm run import:snapshot -- \
  --source apsa \
  --input /path/to/apsa-program.json \
  --output work/apsa-papers.ndjson
```

ICA:

```bash
npm run import:snapshot -- \
  --source ica \
  --input /path/to/papers.json \
  --output work/ica-papers.ndjson
```

The command prints counts and paths but never prints abstracts. Each output record preserves `sourceUrl`, `retrievedAt`, and `rawHash`.

Database loading and asynchronous embedding generation are intentionally kept separate from normalization. This makes it possible to review diffs and provenance before publishing new records.

## Tavily’s role

`src/tavily/client.mjs` supports:

- Search for candidate public conference programs;
- bounded, same-site Crawl with `allow_external: false`;
- path/domain allowlists and exclusion rules;
- project-level usage tracking.

Tavily is a discovery and generic extraction layer, not an authority to ingest everything automatically. A source should move through:

```text
discovered -> sampled -> reviewed -> active -> paused
```

Stable, important sources should receive dedicated adapters like ICA and APSA. Before activating a source, review access rules, robots guidance, data quality, and whether the pages contain only public scholarly metadata.

## API

### `GET /api/health`

Returns the active mode and corpus metadata.

### `POST /api/analyze`

```json
{
  "idea": "I want to test whether AI literacy moderates..."
}
```

Successful responses contain:

- structured idea profile;
- corpus coverage notice;
- closest paper-level evidence;
- overlap dimensions;
- innovation paths labeled as inference;
- recommended next steps;
- limitations.

The server accepts at most 32 KB per request and does not write the raw idea to error logs. It also applies a fixed-window in-memory limiter to the analysis endpoint; the defaults are 10 requests per client address per 60 seconds. This limiter is intentionally lightweight and process-local. Multi-instance production deployments should also enforce rate limits at the edge or API gateway.

## Privacy boundary

- Ideas are not intentionally persisted by the application.
- Raw idea text is excluded from server error logs.
- API keys remain server-side.
- Live model requests use `store: false`.
- Model-generated paper metadata is discarded in favor of canonical retrieved records.
- User ideas and retrieved records are treated as untrusted prompt data, not instructions.
- Source records must preserve provenance and public source URLs.
- Conference abstracts are preliminary records, not peer-reviewed findings.

Users should still be told that live-mode text is sent to configured external API providers and is subject to those providers’ terms and retention controls.

## Why Neo4j and Cognee are deferred

The MVP first tests whether hybrid retrieval plus evidence-grounded analysis solves the core user problem. Neo4j/Cognee can later be evaluated on a fixed benchmark for questions involving theory, mechanism, population, method, and dataset relationships. They should be promoted into the production architecture only if GraphRAG materially improves retrieval or innovation guidance.

## Project documents

- Design: `docs/superpowers/specs/2026-08-21-research-frontier-radar-design.md`
- Implementation plan: `docs/superpowers/plans/2026-08-21-mvp-vertical-slice.md`
