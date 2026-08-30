# `@input/pen-docs`

Private source for the Pen documentation site. This is a workspace Vite + React
app, not a published package. It is not on npm, has no public exports, and is
excluded from changeset versioning.

The site documents shipped surfaces only. Architecture truth lives in `spec/`
and `spec/rules/`.

The live set is the DOC2 page table in `spec/rules/documentation.md`, plus the
HOST5 SSR page. Hash routes: `#/`, `#/getting-started`, `#/core-concepts`,
`#/selection`, `#/extensions`, `#/commands`, `#/collaboration`, `#/ai`,
`#/import-export`, `#/security`, `#/accessibility`, `#/support`,
`#/localization`, `#/upgrade`, `#/ssr`.

Gates run before the Vite build and again as named steps in
`.github/workflows/docs.yml`, so a missing page or drifted table fails before
the Pages artifact is uploaded:

- `scripts/check-doc2-pages.mjs` — required DOC2 pages exist, are registered
  in `src/App.tsx`, cite their owning spec (or the D.3 owner token), still
  contain the headings that teaching needs, and API pages keep a
  `<pre><code>` sample. The old placeholder string is gone. The script
  always prints how many pages it checked.
- `scripts/generate-doc-tables.mjs` — diagnostic, message, export-fidelity,
  paste-corpus, and ingest-bound tables match their sources (check by
  default; `--write` refreshes). A diagnostic row with no emit level fails
  the gate — that is the scanner-lie the DOC3 table used to publish.
- `scripts/check-doc2-samples.mjs` — every `<pre><code>` sample on a docs
  page type-checks

## Run

From the repository root, after `pnpm install`:

```bash
pnpm --filter @input/pen-docs dev
```

Vite serves the site at `http://localhost:5174`. If that port is taken, Vite
exits instead of hopping. `pnpm dev` from the repository root starts this app
alongside the playground and the examples.

```bash
pnpm --filter @input/pen-docs build
pnpm --filter @input/pen-docs preview
```

The docs workflow builds with `PEN_DOCS_BASE` set to the GitHub Pages path
and uploads `packages/docs/dist` only after the three gates above pass.
