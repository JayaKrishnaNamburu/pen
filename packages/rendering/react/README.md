# @input/pen-react

React renderer, primitives, and hooks for Pen.

`@input/pen-react` is the batteries-included renderer surface. If you want clearer optional-feature boundaries, you can import the dedicated subpaths: `@input/pen-react/ai`, `@input/pen-react/ai-suggestions`, `@input/pen-react/search`, `@input/pen-react/history`, and `@input/pen-react/multiplayer`.

## Install

```bash
pnpm add @input/pen-core @input/pen-preset-default @input/pen-react react react-dom
```

## Quick Start

```tsx
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

Pen ships no required stylesheet — the editor is functional unstyled. The custom-property surface and the few correctness styles are listed in [STYLING.md](./STYLING.md).

## Server rendering (HOST5)

SSR is shell-only: the server renders the editor container and no document content. That is a decision, not a gap. Faithful SSR of a CRDT document would require that document on the server. Pen does not own that transport and does not run a server CRDT.

This is HOST5 (`spec-v2/15-host-integration.md`). Canonical copy: the docs site Server rendering page (`packages/docs/src/pages/SSR.tsx`, `#/ssr`).

`<PenEditor>` therefore hydrates an empty shell. Block-list and text-snapshot hooks return empty snapshots on the server on purpose. After hydration the client fills from the live document. Layout effects run through one `useIsomorphicLayoutEffect` seam so a server pass produces zero React warnings.

Hosts that need crawler-visible or statically indexed HTML render it from their own persisted copy with `@input/pen-export-html`, which is DOM-free and server-safe. Construct a headless editor from that copy, export, and destroy — do not expect the React tree to emit this HTML.

```ts
import { createHeadlessEditor } from "@input/pen-core";
import { htmlExporter } from "@input/pen-export-html";

const editor = createHeadlessEditor({ document: hostDocument });
const html = htmlExporter.export(editor);
editor.destroy();
```

Render that string as ordinary HTML next to the editor shell. The editor stays a client island; the exported markup is the host's content surface.

See the root README for the full package overview and licensing details.
