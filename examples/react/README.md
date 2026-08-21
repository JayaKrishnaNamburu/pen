# React example

Minimal Vite + React app that mounts Pen with `@input/pen-preset-default`. `@input/pen-core` is the headless assembly point if you skip the preset.

This package is a workspace member (`examples/react` in `pnpm-workspace.yaml`).

## Install

Pen has not been published. `pnpm add @input/pen-react` 404s on the public registry. This app consumes the workspace packages (`workspace:*` in `package.json`).

From the repository root:

```bash
pnpm install
pnpm build
pnpm --filter @input/pen-example-react dev
```

The post-publish consumer command, including peers, will be:

```bash
pnpm add @input/pen-preset-default @input/pen-core @input/pen-react react react-dom yjs
```

`react` and `react-dom` are peers of `@input/pen-react`. `yjs` is a peer of `@input/pen-crdt-yjs`, which `@input/pen-core` depends on, so every Pen install needs it.

## Mount

```tsx
"use client";

import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { PenEditor } from "@input/pen-react";

const editor = createEditor({
  preset: defaultPreset(),
});

export function App() {
  return <PenEditor editor={editor} />;
}
```

That file is `src/App.tsx`.

Pen ships no required stylesheet — the editor is functional unstyled, including on an empty document. You do not need extra CSS to land a click or the first keystroke. Tokens live in `STYLING.md`, the property reference that ships inside the `@input/pen-react` package.

`@input/pen-react` is a client module (`"use client"`). In Next.js App Router, import `PenEditor` from a Client Component; do not import it from a Server Component.

## Run

Requires Node 22+ and pnpm 9. The install commands above start Vite at `http://localhost:5173`.
