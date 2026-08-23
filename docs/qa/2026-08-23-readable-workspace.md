# Readable workspace QA — 2026-08-23

Scope: GitHub Pages output and rendered accessibility acceptance across
`83ad9023766d60aa87fb291ecb913efa87b4add7` through the final validated product
fix commit `817fbd4330620f4f1b40ef90001e7446dfbf2893`.

## Automated gates

| Command | Result | Observed evidence |
| --- | --- | --- |
| `npm test` | Environment-limited | 91/99 tests passed. The eight failures are all loopback-listener tests and report `listen EPERM: operation not permitted 127.0.0.1`. |
| `npm run check` | PASS | Syntax check passed for 69 JavaScript modules (exit 0). |
| `npm run build` | PASS | Deployable application built in `dist/` (exit 0). |
| `npm run pages:build` | PASS | Pages artifact `pages-dist` built with 10 files (exit 0). |

`npm run pages:build` itself exited 0 after producing the Pages artifact and
completing its secret scan. The separate passing Pages-builder test validates the
builder contract; it is not the evidence for this artifact build. The suite's
overall non-zero exit is solely the eight loopback-listener failures above.
Focused behavior contracts cover reduced-motion scroll selection and
render-safe, bilingual corpus fallback.

## Rendered QA

The local sandbox cannot serve a page, but the controller completed the following
true browser checks on a standard local HTTP surface. The observations are
recorded here with that provenance.

For returned-paper rendering, the controller injected one deterministic response
with 20 records conforming to the Edge `relatedPapers` contract into a
git-ignored `pages-dist` QA copy served by a basic local read-only static server.
This validates the new frontend DOM/CSS renderer only; it is **not production
retrieval evidence**. Production live analysis is deferred to the Stage D online
acceptance.

| Check | Viewport / setting | Result | Evidence / follow-up |
| --- | --- | --- | --- |
| Dominant analysis column and desktop structure | 1440 × 900 | PASS | Body 18px; input 16px; sidebar sticky; mobile header hidden; hero 980px; no horizontal overflow. |
| Desktop breakpoint and type | 900 × 900 | PASS | Desktop breakpoint remained active; body 18px; h1 64.8px without overflow; hero 652px; no horizontal overflow. |
| Mobile layout and type | 390 × 844 | PASS | Body 17px; input 16px; mobile header flex; menu target 44.39px; hero 368px; no horizontal overflow. |
| Drawer keyboard and focus return | 390 × 844 | PASS | Closed x=-336, open x=0; Escape returned `data-open=false` and `aria-expanded=false`, then restored focus to the menu button. |
| Chinese labels and clipping | 390 × 844, `lang=zh` | PASS | Title and controls switched to Chinese; visible content did not clip and had no horizontal overflow. The closed off-canvas sidebar was intentionally outside the viewport. |
| Corpus fallback and locale switch | Clean artifact tab, corpus-status unavailable, `lang=zh` | PASS | No console errors or warnings; `html lang=zh`; ledger displayed APSA/ICA and the Chinese 8,906-paper copy; mode displayed `语料库`; no horizontal overflow. |
| Equivalent 200% reflow | 720 × 450 CSS viewport | PASS (equivalent viewport) | Used as the 1440px page's 200% equivalent: body 17px, mobile header, hero 688px, menu target 44.39px, no horizontal overflow. Native browser zoom was not verified. |
| Anonymous analysis failure | localhost | PASS (failure behavior) | Returned a closed-dictionary error and generated no report. |
| Twenty returned papers render once each | 1440 × 900 deterministic contract fixture | PASS (non-production retrieval evidence) | 20 cards, 20 unique `data-paper-id` values (`qa-paper-01`–`qa-paper-20`), 20 save buttons, 20 export buttons, and 20 metadata rows; progress said `报告已生成`. |
| Abstract and card overflow | 1440 × 900 deterministic contract fixture | PASS (non-production retrieval evidence) | Abstract font 18px; abstract overflow 0; card overflow 0; page had no horizontal overflow. |
| Mobile result cards and abstract overflow | 390 × 844 Chinese deterministic contract fixture | PASS (non-production retrieval evidence) | `lang=zh`; 20 cards and unique IDs; abstract font 17px; abstract/card/page overflow 0; no visible result offenders; action min-height 44.390625px. |
| Reduced motion | Pages artifact with `prefers-reduced-motion: reduce` | PASS | `matchMedia` matched; `html` scroll behavior was `auto`; workspace nav, progress bar, and primary-button transition durations were 0s; results-v2 loaded the no-motion abstract-preview rule. |

## Acceptance conclusion

No Task 5 acceptance remains open. Native browser zoom was not directly
simulated; the accepted 720 × 450 equivalent-CSS-viewport limitation above is
the recorded substitute. Production live analysis remains a Stage D online
acceptance, outside this fixture-based frontend rendering evidence.
