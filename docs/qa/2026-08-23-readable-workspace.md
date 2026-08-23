# Readable workspace QA — 2026-08-23

Scope: GitHub Pages output and rendered accessibility acceptance for commit
`83ad9023766d60aa87fb291ecb913efa87b4add7`.

## Automated gates

| Command | Result | Observed evidence |
| --- | --- | --- |
| `npm test` | Environment-limited | 87/95 tests passed. The eight failures are all loopback-listener tests and report `listen EPERM: operation not permitted 127.0.0.1`. |
| `npm run check` | PASS | Syntax check passed for 67 JavaScript modules (exit 0). |
| `npm run build` | PASS | Deployable application built in `dist/` (exit 0). |
| `npm run pages:build` | PASS | Pages artifact `pages-dist` built with 9 files (exit 0). |

The Pages artifact and secret scan are covered by the passing Pages-builder test
in the product test suite; the suite's overall non-zero exit is solely the eight
loopback-listener failures above.

## Rendered QA

`npm run dev` exited 1 before a local page became available. Its visible output
was `Server failed: Error`; the server only logs the error name. In the same
sandbox, the listener test failures explicitly report `EPERM`, so rendered QA is
blocked by the local-listening environment. No browser or visual result is being
claimed from static inspection.

| Check | Viewport / setting | Result | Evidence / follow-up |
| --- | --- | --- | --- |
| Dominant analysis column | 1440px | blocked | No locally rendered page was available. |
| Dominant analysis column | 900px | blocked | No locally rendered page was available. |
| Mobile layout | 390px | blocked | No locally rendered page was available. |
| Typography lower bound | 1440px, 900px, 390px | blocked | Requires computed rendered styles. |
| Drawer keyboard, Escape, and focus return | 390px | blocked | Requires interactive rendered UI. |
| Twenty returned papers render once each | 1440px | blocked | Requires a rendered result set. |
| Abstract overflow | 1440px, 900px, 390px | blocked | Requires rendered content. |
| Reduced motion | reduced-motion preference | blocked | Requires rendered UI and preference emulation. |
| English and Chinese labels | 1440px, 900px, 390px | blocked | Requires visual inspection in both locales. |
| Zoom behavior | 200% zoom | blocked | Requires a rendered page. |

## Required follow-up

Run the same viewport, interaction, locale, reduced-motion, and 200% zoom checks
on a surface that permits a local HTTP listener, then replace only the relevant
`blocked` rows with directly observed results.
