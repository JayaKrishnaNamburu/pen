---
"@input/pen-core": patch
"@input/pen-preset-default": patch
"@input/pen-react": patch
---

Tell adopters the public npm install path is not live yet, and keep the documented React install complete.

The root README now states that the first release train has not been published (workspace version 0.0.1), so registry `pnpm add` 404s until it is. The post-publish command includes the `react` / `react-dom` peers `@input/pen-react` actually requires. `scripts/doc-refs.mjs` is the DOC1/DOC2 gate: every `@input/pen-*` name and version in adopter markdown must exist in the workspace, and extracted samples must type-check against built `.d.ts`.
