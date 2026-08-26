# Deprecated frontend

This directory contains the legacy vanilla HTML/CSS/JavaScript frontend. It is retained for the existing local Node.js workflow, regression tests, and history, but it is no longer the production UI.

The single source of truth for the GitHub Pages product is [`../frontend/`](../frontend/). Production assets are built with Vite and React, then copied from `frontend/dist/` to `pages-dist/` by `scripts/build-pages.mjs`.

Do not implement or update product UI in this directory. For UI development, run and edit `frontend/`.

Transitional exceptions:

- `config.template.js` is still read by `scripts/build-pages.mjs` to generate the public runtime `config.js` in the Pages artifact.
- The root Node.js server and `scripts/build.mjs` still serve/package this legacy frontend to preserve the current local workflow.
- Several regression tests still import or inspect these files; keep them until that legacy coverage is intentionally retired.

Do not delete or relocate these files without a separate migration that updates the local server, build scripts, and legacy tests together.
