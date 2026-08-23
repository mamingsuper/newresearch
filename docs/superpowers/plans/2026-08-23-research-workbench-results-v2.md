# Research Workbench Results V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the public beta into a query-first research workbench with staged scan progress, deterministic Top 20 Hybrid RRF results, complete abstracts, and readable author-year/title citations.

**Architecture:** Keep the current single-request GitHub Pages → Supabase Edge flow. The Edge Function retrieves the canonical Top 20 rows from `hybrid_search_papers`, returns them as `relatedPapers`, and separately asks the analysis model for the profile/directions/recommendations; all model paper IDs are validated and expanded into canonical readable citations before returning. The browser owns only presentation and interpolated progress, never ranking or bibliographic truth.

**Tech Stack:** Node.js 22 tests/build, static HTML/CSS/ES modules, Supabase Edge Functions (Deno/TypeScript), Supabase PostgreSQL Hybrid RRF RPC, OpenAI embeddings/Responses API.

**Spec:** `docs/superpowers/specs/2026-08-23-research-workbench-results-v2-design.md`

## Global Constraints

- Production corpus stays at 8,906 papers: APSA 2026 = 5,493 and ICA 2026 = 3,413.
- Production vector space remains `text-embedding-3-small`, 512 dimensions; no re-embedding or schema change in this work.
- The Edge endpoint remains a single POST request; no polling, SSE, or job table.
- Retrieval must request exactly 20 rows and preserve database RRF score order.
- Visible paper metadata must come from database rows, not model-generated bibliography.
- Full stored abstracts are returned and displayed; no 300-character truncation for the Top 20 list.
- Raw UUIDs must not appear as visible grounding citations.
- Existing CORS, HMAC rate limiting, request limits, `store:false`, `no-store`, and corpus-scope/novelty safeguards remain intact.
- UI progress may interpolate but cannot reach 100% before a successful API response.

---

### Task 1: Edge API Top 20 and canonical citations

**Files:**
- Modify: `tests/edge-function-contract.test.mjs`
- Modify: `supabase/functions/_shared/idea-radar.ts`

**Interfaces:**
- Consumes: `hybrid_search_papers(query_text, query_embedding, match_count)` rows with canonical `id`, `title`, `abstract`, `authors`, conference metadata, keywords, source URL, and `score`.
- Produces: response `data.relatedPapers: RelatedPaper[]`; each innovation path gains `evidenceReferences: CitationReference[]`.

`RelatedPaper` shape:
```ts
{
  paperId: string;
  rank: number;
  score: number;
  title: string;
  authors: unknown[];
  authorYearLabel: string;
  conference: string;
  conferenceSlug: string;
  conferenceYear: number;
  abstract: string;
  keywords: string[];
  division: string | null;
  sessionTitle: string | null;
  sourceUrl: string;
}
```

`CitationReference` shape:
```ts
{
  paperId: string;
  authorYearLabel: string;
  title: string;
  conference: string;
  sourceUrl: string;
}
```

- [ ] **Step 1: Write failing Edge contract tests**

Update the source contract assertions to require:
```js
assert.match(source, /match_count\s*:\s*20/);
assert.match(source, /relatedPapers/);
assert.match(source, /authorYearLabel/);
assert.match(source, /abstract:\s*String\(row\.abstract/);
assert.match(source, /rank:\s*index\s*\+\s*1/);
assert.match(source, /score:\s*Number\(row\.score/);
assert.match(source, /evidenceReferences/);
assert.match(source, /authors/);
assert.doesNotMatch(source, /match_count\s*:\s*12/);
```
Keep all existing security assertions.

- [ ] **Step 2: Commit the tests and verify RED in CI**

Expected: `npm test` fails because production source still has `match_count: 12` and no `relatedPapers`/readable citation expansion.

- [ ] **Step 3: Implement canonical Top 20 mapping**

In `idea-radar.ts`:
```ts
const MATCH_COUNT = 20;

function canonicalAuthorNames(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors
    .map((author) => typeof author === 'object' && author ? String((author as Record<string, unknown>).name ?? '').trim() : '')
    .filter((name) => name && !/^unregistered participant$/i.test(name));
}

function surname(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.at(-1) ?? name;
}

function authorYearLabel(row: EvidenceRow): string {
  const names = canonicalAuthorNames(row.authors);
  const year = Number(row.conference_year ?? 0);
  if (names.length === 1) return `${surname(names[0])} ${year}`;
  if (names.length === 2) return `${surname(names[0])} & ${surname(names[1])} ${year}`;
  if (names.length >= 3) return `${surname(names[0])} et al. ${year}`;
  return `${String(row.conference_name ?? row.conference_slug ?? 'Conference')} ${year}`.trim();
}

function relatedPapers(rows: EvidenceRow[]) {
  return rows.map((row, index) => ({
    paperId: String(row.id),
    rank: index + 1,
    score: Number(row.score ?? 0),
    title: String(row.title ?? ''),
    authors: Array.isArray(row.authors) ? row.authors : [],
    authorYearLabel: authorYearLabel(row),
    conference: `${String(row.conference_name ?? '')} ${Number(row.conference_year ?? 0)}`.trim(),
    conferenceSlug: String(row.conference_slug ?? ''),
    conferenceYear: Number(row.conference_year ?? 0),
    abstract: String(row.abstract ?? ''),
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    division: row.division ? String(row.division) : null,
    sessionTitle: row.session_title ? String(row.session_title) : null,
    sourceUrl: String(row.source_url ?? ''),
  }));
}
```
Call RPC with `match_count: MATCH_COUNT`; do not slice/reorder after the RPC except `rows.slice(0, MATCH_COUNT)` as a defensive cap.

- [ ] **Step 4: Expand innovation evidence IDs into readable citations**

After validating every `evidencePaperIds` ID is in `allowedPaperIds`, build `evidenceReferences` from canonical rows:
```ts
const evidenceReferences = ids.map((id) => {
  const row = evidenceById.get(String(id))!;
  return {
    paperId: String(row.id),
    authorYearLabel: authorYearLabel(row),
    title: String(row.title ?? ''),
    conference: `${String(row.conference_name ?? '')} ${Number(row.conference_year ?? 0)}`.trim(),
    sourceUrl: String(row.source_url ?? ''),
  };
});
```
Return `{ ...report, relatedPapers: relatedPapers(rows), innovationPaths: groundedPaths }`.

- [ ] **Step 5: Verify GREEN**

Run CI-equivalent commands via GitHub Actions: `npm test`, `npm run check`, `npm run build`, `npm run pages:build`.

- [ ] **Step 6: Commit Task 1**

Commit message: `feat: return canonical top 20 related papers`

---

### Task 2: Query-first homepage and staged progress

**Files:**
- Modify: `tests/static-ui.test.mjs`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/app.js`

**Interfaces:**
- Consumes: existing `corpus-status` payload and `analyze-idea` response.
- Produces: centered form, corpus summary, `#search-progress`, `#progress-bar`, `#progress-percent`, `#progress-stage`, and staged progress controller.

- [ ] **Step 1: Replace the old landing-layout test with failing workbench tests**

Require HTML/source markers:
```js
assert.match(html, /APSA 2026/);
assert.match(html, /ICA 2026/);
assert.match(html, /8,906 abstracts/);
assert.match(html, /id="search-progress"/);
assert.doesNotMatch(html, /id="live-workbench"/);
assert.match(script, /Understanding the research question/);
assert.match(script, /Reading corpus scope: APSA 2026 \+ ICA 2026/);
assert.match(script, /Generating the query embedding/);
assert.match(script, /Hybrid vector \+ full-text retrieval/);
assert.match(script, /Ranking the most relevant papers/);
assert.match(script, /Generating evidence-grounded analysis/);
assert.match(script, /Report ready/);
assert.match(script, /target:\s*90/);
assert.match(script, /target:\s*94/);
```
Add a guard that 100 is set only from the success path, not the waiting timer.

- [ ] **Step 2: Commit and verify RED in CI**

Expected: old hero contains `live-workbench`; progress IDs/stages are missing.

- [ ] **Step 3: Implement centered query-first markup**

Replace the large two-column hero with:
```html
<section class="query-hero shell" aria-labelledby="hero-title">
  <div class="query-intro">
    <p class="eyebrow">Live conference evidence / social science</p>
    <h1 id="hero-title">Scan your research idea against the frontier</h1>
    <p class="corpus-ledger" id="corpus-ledger">APSA 2026 · 5,493 papers + ICA 2026 · 3,413 papers = 8,906 abstracts</p>
    <p class="hero-copy">Compare your idea with the currently indexed conference corpus, inspect the closest papers, and build evidence-linked directions.</p>
  </div>
  <!-- existing form moved here -->
  <section id="search-progress" class="search-progress" aria-live="polite" hidden>...</section>
</section>
```
Keep header, report, privacy, examples, and disclaimers.

- [ ] **Step 4: Increase typography and visual dominance**

CSS requirements:
```css
body { font-size: 16px; }
.query-hero { max-width: 1080px; padding: 72px 0 84px; }
.query-intro { text-align: center; }
.idea-console { width: min(100%, 980px); margin-inline: auto; }
textarea { min-height: 240px; font-size: 1.125rem; line-height: 1.65; padding: 26px 28px; }
.hero-copy, .corpus-ledger { font-size: 1.08rem; line-height: 1.65; }
```
Do not reduce mobile accessibility.

- [ ] **Step 5: Implement progress controller**

Use milestones:
```js
const PROGRESS_STAGES = [
  { target: 5, label: 'Understanding the research question' },
  { target: 20, label: 'Reading corpus scope: APSA 2026 + ICA 2026' },
  { target: 35, label: 'Generating the query embedding' },
  { target: 55, label: 'Running Hybrid vector + full-text retrieval' },
  { target: 75, label: 'Ranking the most relevant papers' },
  { target: 90, label: 'Generating evidence-grounded analysis' },
  { target: 94, label: 'Finalizing grounded citations' },
];
```
Interpolate by timer while request is pending. `completeProgress()` is called only after `response.ok` and payload parsing succeed, sets 100 and `Report ready`. `failProgress()` clears the timer and never sets 100.

- [ ] **Step 6: Verify GREEN and commit**

Commit message: `feat: center the research scan workflow`

---

### Task 3: Top 20 result list, full abstracts, readable evidence references

**Files:**
- Modify: `tests/static-ui.test.mjs`
- Modify: `public/app.js`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes: `report.relatedPapers[]` and `innovationPaths[].evidenceReferences[]` from Task 1.
- Produces: ranked one-column Top 20 list with full abstracts and linked human-readable citations.

- [ ] **Step 1: Write failing result-renderer source tests**

Require:
```js
assert.match(script, /relatedPapers/);
assert.match(script, /authorYearLabel/);
assert.match(script, /paper\.abstract/);
assert.match(script, /relevance score/i);
assert.match(script, /evidenceReferences/);
assert.doesNotMatch(script, /Grounded in:.*evidencePaperIds/);
assert.doesNotMatch(script, /renderClosestWork\(report\.closestWork\)/);
```
Keep the unsafe-HTML guard.

- [ ] **Step 2: Commit and verify RED**

Expected: renderer still reads `closestWork`, uses excerpt-style `evidence`, and falls back to raw IDs.

- [ ] **Step 3: Replace the paper-card grid with a ranked list**

Implement `renderRelatedPapers(items)` that:
- sorts defensively by `rank` ascending without changing equal-order semantics;
- shows `#01`, `authorYearLabel`, title, conference, formatted score, keywords/division, and source link;
- appends a normal paragraph with `paper.abstract` verbatim as returned by the server;
- renders actual returned count when fewer than 20.

Do not truncate the abstract in JS or CSS.

- [ ] **Step 4: Render readable innovation citations**

For every `path.evidenceReferences`, render linked citation rows:
```text
Shalaby et al. 2026 — Authoritarian Mobility Management: Controlling Movement in and through Nicaragua
```
Link to `sourceUrl` where available and keep `paperId` only as a non-visible `data-paper-id` attribute.

- [ ] **Step 5: Improve report readability**

Use one-column evidence rows, abstract body size around 16–17 px and line-height around 1.65; increase recommendation/limitation body copy to at least 16 px; retain responsive layout.

- [ ] **Step 6: Verify GREEN and commit**

Commit message: `feat: show top 20 papers with full abstracts`

---

### Task 4: Full verification, deployment, and public smoke test

**Files:**
- No new product files unless verification finds a defect.
- Deploy: `supabase/functions/analyze-idea/index.ts` plus `_shared/idea-radar.ts` dependency.

**Interfaces:**
- Consumes: completed feature branch.
- Produces: merged `main`, deployed Edge version, rebuilt GitHub Pages site.

- [ ] **Step 1: Run final GitHub Actions verification**

Require a fresh successful run proving:
```text
npm install --ignore-scripts
npm test
npm run check
npm run build
npm run pages:build
```
No completion claim before all steps show success.

- [ ] **Step 2: Review the complete PR diff**

Check specifically for:
- no vector-model/schema/rate-limit changes;
- no secret-shaped content;
- `match_count: 20` only for retrieval;
- full abstracts returned only from canonical rows;
- no visible UUID citation fallback.

- [ ] **Step 3: Deploy the Edge Function**

Deploy the exact branch versions of:
- `supabase/functions/analyze-idea/index.ts`
- `supabase/functions/_shared/idea-radar.ts`
with the same `verify_jwt` setting as the existing public function.

- [ ] **Step 4: Run real English and Chinese API smoke tests from Supabase PostgreSQL `pg_net`**

Verify both return HTTP 200 and assert from the response JSON:
- `relatedPapers.length = 20` when at least 20 rows are retrieved;
- ranks are 1–20 in ascending display order;
- each paper has non-empty `abstract`, `title`, and `authorYearLabel`;
- innovation references expose readable labels/titles, not only UUIDs.

Also re-check `corpus-status`: `ready=true`, `paperCount=8906`, `embeddedPaperCount=8906`, `pending=0`, `failed=0`.

- [ ] **Step 5: Open PR, verify CI, and squash merge**

Use expected head SHA to prevent merging a moved branch. Merge only after fresh CI and review checks are clean.

- [ ] **Step 6: Verify public Pages output**

From a server-side HTTP probe, require the public site to return HTTP 200 and contain the new query-first copy/progress markers. Confirm the deployed browser API base remains the Supabase Edge URL and Pages artifact contains no secrets.

- [ ] **Step 7: Report final production state**

Include merge SHA, Edge smoke-test results, corpus status, and public test URL.
