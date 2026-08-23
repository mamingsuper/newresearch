# Readable workspace QA — 2026-08-23

Scope: GitHub Pages output and rendered accessibility acceptance for commit
`83ad9023766d60aa87fb291ecb913efa87b4add7`.

## Automated gates

| Command | Result | Observed evidence |
| --- | --- | --- |
| `npm test` | Environment-limited | 89/97 tests passed. The eight failures are all loopback-listener tests and report `listen EPERM: operation not permitted 127.0.0.1`. |
| `npm run check` | PASS | Syntax check passed for 67 JavaScript modules (exit 0). |
| `npm run build` | PASS | Deployable application built in `dist/` (exit 0). |
| `npm run pages:build` | PASS | Pages artifact `pages-dist` built with 9 files (exit 0). |

The Pages artifact and secret scan are covered by the passing Pages-builder test
in the product test suite; the suite's overall non-zero exit is solely the eight
loopback-listener failures above. The focused contracts for reduced motion and
normalized corpus fallback pass.

## Rendered QA

The local sandbox cannot serve a page, but the controller completed the following
true browser checks on a standard local HTTP surface. The observations are
recorded here with that provenance. The two blocked rows are not PASS results.

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
| Twenty returned papers render once each | localhost | blocked | No successful anonymous report was available; the static contract only proves one append and does not substitute for rendered QA. |
| Abstract overflow | rendered result cards | blocked | Requires a successful rendered result set. |
| Reduced motion | Pages artifact with `prefers-reduced-motion: reduce` | PASS | `matchMedia` matched; `html` scroll behavior was `auto`; workspace nav, progress bar, and primary-button transition durations were 0s; results-v2 loaded the no-motion abstract-preview rule. |

## Required follow-up

Obtain a successful returned paper set before replacing the remaining two
`blocked` rows with directly observed results.
