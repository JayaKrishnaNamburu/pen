# Examples

Three host apps live here. They are the supported examples:

| Directory | Package | Host |
| --- | --- | --- |
| `react/` | `@input/pen-example-react` | React |
| `vue/` | `@input/pen-example-vue` | Vue |
| `vanilla/` | `@input/pen-example-vanilla` | `@input/pen-dom` |

Each is a private Vite app, a pnpm workspace member, and covered by `.github/workflows/examples.yml`. The smoke job builds the app from workspace artifacts, opens it, clicks the empty paragraph, types a character, and presses Mod-Z. A page that only mounts is not a pass.

Earlier planning also named `collaboration`, `ai`, `import-export`, and `rsc`. Those directories do not exist, and this tree does not scaffold them. A half-working app in each of those names would be a false promise: nothing is published, the interesting paths already have real homes, and an unrun example rots immediately.

| Named and missing | Where that path actually lives |
| --- | --- |
| `collaboration` | `playground/` — two clients on one document, via the collaborate button |
| `ai` | `playground/` plus the AI package READMEs — a stub adapter with no vendor SDK is not an example until someone has clicked it |
| `import-export` | the import/export package READMEs and their tests — a round-trip UI that nobody has run is worse than no UI |
| `rsc` | `packages/rendering/react/fixtures/rsc/` — HOST1 is a `"use client"` assert, not a Next.js app |

The shorter names (`react`, `vue`, `vanilla`) are the `*-minimal` apps. There is no second copy under the longer names.

## Run

Pen is unpublished. `pnpm add @input/pen-*` 404s. From the repository root:

```bash
pnpm install
pnpm dev -- --filter=@input/pen-example-react
```

Same filter for `vue` and `vanilla`. Turbo builds workspace package `dist/` first, then Vite serves the app at `http://localhost:5173`.

## Smoke

```bash
pnpm --filter @input/pen-example-react... run build
EXAMPLE=react pnpm exec playwright test --config examples/playwright.config.ts --project=chromium
```

`EXAMPLE` must be `react`, `vue`, or `vanilla`. Anything else fails closed.
