# Research Frontier Radar Design

## Product intent

Research Frontier Radar helps social-science researchers compare an early-stage research idea against recent conference-paper metadata and abstracts. It does not claim to prove global novelty. It reports what was and was not found in the currently indexed corpus, explains the dimensions of overlap, and proposes evidence-grounded ways to refine the study.

## MVP promise

A user pastes a research idea. The system:

1. validates and structures the idea;
2. retrieves related conference papers with hybrid keyword and semantic search;
3. explains direct and adjacent overlap at the paper level;
4. proposes concrete innovation paths tied to retrieved evidence;
5. displays corpus coverage and limitations prominently;
6. links every cited paper back to its source conference page.

The system must never say that nobody has done an idea. Approved wording is limited to statements such as: "No direct match was found in the currently indexed conference corpus."

## MVP scope

### Included

- ICA 2026 and APSA 2026 import adapters.
- A reusable normalized paper schema.
- Supabase Postgres as the canonical datastore, protected with RLS and backend-only grants.
- pgvector plus Postgres full-text search for reciprocal-rank-fusion hybrid retrieval.
- OpenAI Responses API for structured idea analysis and evidence-grounded synthesis.
- Tavily Search/Crawl adapters for discovering and sampling public conference-program pages.
- A public-facing web interface with an idea input form and structured report.
- A mock mode that runs without external credentials.
- Tests, CI, database migrations, provenance fields, and setup documentation.

### Explicitly deferred

- Neo4j, Cognee, GraphRAG, or knowledge-graph extraction.
- User accounts, payments, teams, saved projects, or collaboration features.
- Automatic full-web novelty claims.
- PDF ingestion and full-paper analysis.
- Continuous unattended crawling of every discovered source.
- Automatic author contact or manuscript generation.

## Architecture

```text
Public conference pages / existing snapshots
                  |
       source-specific adapters
       + Tavily discovery/crawl
                  |
              normalizer
                  |
          provenance validation
                  |
       Supabase Postgres + pgvector
                  |
        hybrid retrieval (RRF)
                  |
          OpenAI Responses API
                  |
      evidence-grounded report JSON
                  |
        browser-native web UI
```

### Application

Use a dependency-free Node.js 22.9+ server with browser-native HTML, CSS, and JavaScript for the first vertical slice. Server modules own orchestration and provider adapters; the browser renders the form and report. The default `APP_MODE=mock` path must work without secrets, so every pull request and local checkout can run tests and preview the experience. The domain and provider boundaries are intentionally framework-neutral so the UI can later migrate to Next.js without changing the data or analysis contracts.

### Canonical data store

Supabase is the source of truth for conference sources, crawl runs, normalized papers, provenance, and embeddings. The system stores authoritative source text separately from model-derived interpretations.

The `papers` table contains:

- stable UUID;
- conference slug and year;
- source record identifier;
- title and abstract;
- normalized author JSON;
- division/session metadata;
- original source URL;
- retrieval timestamp and raw-content hash;
- generated full-text-search column;
- 512-dimensional embedding.

### Retrieval

The live retriever embeds the user's idea with `text-embedding-3-small` using 512 dimensions. A Postgres RPC runs keyword and vector searches separately, fuses their ranks with reciprocal-rank fusion, and returns up to 20 evidence papers.

The retriever interface is implementation-independent:

```ts
interface PaperRetriever {
  search(input: SearchInput): Promise<EvidencePaper[]>;
}
```

A deterministic local retriever implements the same interface for tests and mock mode.

### Analysis

The analyzer receives only the user idea, corpus-coverage metadata, and retrieved evidence papers. It returns JSON constrained by the Responses API JSON Schema and revalidated by the application’s built-in runtime validator with these sections:

- `ideaProfile`;
- `coverageNotice`;
- `closestWork`;
- `innovationPaths`;
- `recommendedNextSteps`;
- `limitations`.

Every `closestWork` item references a retrieved `paperId`. Innovation suggestions distinguish source evidence from model inference. OpenAI calls use the Responses API with structured outputs and `store: false`.

Model output is never authoritative for paper titles, conference labels, evidence excerpts, or source URLs. After validating every cited ID against the retrieval set, the server rehydrates those fields from canonical retrieved records. The prompt treats the user idea and all conference content as untrusted data and imposes an output-token ceiling.

### Tavily ingestion boundary

Tavily supports discovery and generic crawling, not unquestioned autonomous ingestion. A conference source progresses through these states:

```text
discovered -> sampled -> reviewed -> active -> paused
```

The MVP exposes reusable Tavily clients and a source-registry schema. It does not schedule arbitrary production crawls. Important recurring sources should eventually receive dedicated adapters to reduce cost and improve data quality.

## Privacy and safety

- User ideas are not persisted by default.
- Raw ideas must not be written to application logs.
- API keys remain server-only.
- OpenAI requests set `store: false`.
- The public analysis endpoint uses a bounded request body and a process-local fixed-window limiter; production deployments add an edge or gateway limiter for multi-instance enforcement.
- The UI discloses that idea text is sent to configured model providers in live mode.
- Source ingestion is limited to public scholarly metadata and must preserve provenance.
- Crawlers must support domain/path allowlists and respect source policies.
- Reports must present conference abstracts as preliminary scholarly records, not peer-reviewed findings.

## Error handling

- Invalid or very short ideas return HTTP 400 with a stable error shape.
- Missing live-mode credentials return HTTP 503 with setup guidance; the server never silently falls back from live to mock.
- Retrieval failures produce a user-safe message and an internal request identifier without logging the idea.
- If no papers are returned, the analyzer is not called; the response reports corpus limitations and suggests query refinement.
- Invalid model JSON fails closed and returns HTTP 502 rather than rendering unvalidated prose.

## Testing strategy

- Unit tests for schemas, ICA/APSA normalization, Tavily request construction, mock retrieval, and report validation.
- Route-handler tests with dependency injection and no network calls.
- Browser/static contract tests for the idea form, safe DOM rendering, source-link behavior, and static serving.
- Migration smoke checks for required extensions, tables, RLS, grants, indexes, and RPC definitions.
- CI runs the Node test suite, syntax checks, and a production build.

## Deployment model

- Web application: any Node 22.9-compatible free host; a Next.js or Cloudflare adapter can be added later without changing domain modules.
- Database: Supabase Free during MVP.
- Data refresh: manual scripts initially; GitHub Actions can be added after adapters are stable.
- Secrets: host environment variables only.

## Success criteria

The first milestone is complete when:

1. `npm run dev` opens a usable mock demo without credentials;
2. a sample idea returns retrieved papers and a structured report;
3. the live integration has tested adapters for Supabase, OpenAI, and Tavily;
4. the Supabase migration defines the canonical schema and hybrid-search RPC;
5. tests and production build pass in CI;
6. documentation explains how to import ICA/APSA snapshots and switch to live mode;
7. the repository has zero runtime dependencies and passes the built-in Node test suite offline.
