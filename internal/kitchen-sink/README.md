# Kitchen sink

The maintainer kitchen sink: a private Vite + React app (`private: true`) that
exercises shipped Pen packages together, including a local AI and
collaboration backend, and hosts the Playwright end-to-end suite. It is a demo
for working in this monorepo, not a product and not a consumer example. Vite
aliases `@input/pen-*` to workspace source so maintainers can iterate without a
publish cycle. Do not copy this app's aliases or Anthropic server into a host.

If you are looking for a readable app to learn Pen from, use
[`playground/`](../../playground/README.md) instead — this one trades clarity
for coverage.

Pen is licensed under the [MIT License](../../LICENSE.md).

## Peers

Workspace packages the playground imports declare these peers. They are already
listed in `internal/kitchen-sink/package.json` (or resolved by the root workspace
install):

- `react` and `react-dom` `^18 || ^19` (`@input/pen-react`)
- `yjs` `^13.6` and `y-protocols` `^1.0.7` (`@input/pen-crdt-yjs`)

The playground pins React 19 and `yjs` `13.6.29`.

## Run from the monorepo

Requires Node 22+ and pnpm 9. From the repository root:

```bash
pnpm install
```

Start the UI and the AI / collaboration backend in two terminals:

```bash
pnpm --filter @input/pen-kitchen-sink dev
pnpm --filter @input/pen-kitchen-sink dev:backend
```

Vite serves the UI at `http://localhost:5173` and proxies `/api` and `/health`
to the backend on `127.0.0.1:8787`. Collaboration upgrades go through the same
backend on `/collaboration`.

The editor UI runs without a model key. AI features need `ANTHROPIC_API_KEY` in
`internal/kitchen-sink/.env.local` before starting `dev:backend`.

Server unit tests (planner routing and local payload helpers):

```bash
pnpm --filter @input/pen-kitchen-sink test
```

End-to-end tests from the repository root:

```bash
pnpm test:e2e
```

## Manual RTL script

Wave 6.5 Arabic + Latin email-draft fixture. Qualitative only — this is
not the bidi conformance suite and does **not** claim 1px agreement with
browser-native selection rects.

Vite only; the collaboration backend is not required.

```bash
pnpm --filter @input/pen-kitchen-sink dev
```

Open [http://localhost:5173/#/rtl-email](http://localhost:5173/#/rtl-email)
(`?fixture=rtl-email` is the same page). Overlay caret and selection rect
are on.

The draft mixes Latin reply text with Arabic quoting: an Arabic-first
blockquote that embeds `Thursday 3pm` / `Q3`, a Latin-first quote that
embeds `الملف المرفق`, and a Latin reply that quotes
`هل يمكننا تأجيل الاجتماع؟`.

### Caret left / right

1. Click inside the Arabic-first quote (`مرحبا، هل يمكننا…`).
2. Press ArrowLeft and ArrowRight through the Arabic run and the Latin
   embeds (`Thursday 3pm`, `Q3`).
3. Click the Latin reply and walk the caret through the quoted Arabic
   span `هل يمكننا تأجيل الاجتماع؟` and back into Latin.
4. Look for a single caret that stays on one edge at each run boundary.
   Dual carets are out of scope. Arrow direction follows the resolved
   block (RTL Left = reading-order forward once the M2 keymap swap
   lands; until then arrows stay logical).

### Selection highlight

1. Drag-select the mixed Arabic quote line (Arabic + `Thursday 3pm` +
   Latin).
2. Shift-arrow extend across the same span from either end.
3. The highlight should follow the visual runs. A single rectangle that
   spans the wrong visual interval is a miss. Do not score this against
   a 1px native-rect tolerance.

### Overlay caret

1. Click: start of the Arabic quote, the `Thursday` embed, and the Latin
   reply’s Arabic quotation.
2. The overlay caret should sit on the same edge as the native caret.
3. Click the “RTL email draft” title (blur) and click back into a mixed
   span; the overlay should return on the focused caret.
