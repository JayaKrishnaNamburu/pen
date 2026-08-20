# `@input/pen-docs`

Private source for the Pen documentation site. This is a workspace Vite + React
app, not a published package. It is not on npm, has no public exports, and is
excluded from changeset versioning.

The site documents shipped surfaces only. Architecture truth lives in `spec/`
and `spec-v2/`.

The live set is a stub: home, the collaboration boundary page (COL5), and the
SSR page (HOST5). That replaces the empty placeholder deploy. It is not the
full DOC2 content set in `spec-v2/17-documentation.md`.

## Run

From the repository root, after `pnpm install`:

```bash
pnpm --filter @input/pen-docs dev
```

Vite serves the site at `http://localhost:5173`. Hash routes: `#/`,
`#/collaboration`, `#/ssr`.

```bash
pnpm --filter @input/pen-docs build
pnpm --filter @input/pen-docs preview
```

CI builds with `PEN_DOCS_BASE` set to the GitHub Pages path and uploads
`packages/docs/dist`.
