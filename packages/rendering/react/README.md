# @input/pen-react

React renderer, primitives, and hooks for Pen.

`@input/pen-react` is the batteries-included renderer surface. If you want clearer optional-feature boundaries, you can import the dedicated subpaths: `@input/pen-react/ai`, `@input/pen-react/ai-suggestions`, `@input/pen-react/search`, `@input/pen-react/history`, and `@input/pen-react/multiplayer`.

## Install

```bash
pnpm add @input/pen-core @input/pen-preset-default @input/pen-react react react-dom yjs
```

`react` and `react-dom` are peers of this package. `yjs` is a peer of `@input/pen-crdt-yjs`, which `@input/pen-core` depends on.

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

`PenEditor` requires `editor`. This package does not ship a stylesheet — the editor is functional unstyled. The custom-property surface and the few correctness styles are listed in `STYLING.md`, which ships inside this package.

## Server rendering (HOST5)

SSR is shell-only: the server renders the editor container and no document content. That is a decision, not a gap. Faithful SSR of a CRDT document would require that document on the server. Pen does not own that transport and does not run a server CRDT.

This is HOST5 (`spec-v2/15-host-integration.md`). Canonical copy: the docs site Server rendering page (`packages/docs/src/pages/SSR.tsx`, `#/ssr`).

`<PenEditor>` therefore hydrates an empty shell. Block-list and text-snapshot hooks return empty snapshots on the server on purpose. After hydration the client fills from the live document. Layout effects run through one `useIsomorphicLayoutEffect` seam so a server pass produces zero React warnings.

Hosts that need crawler-visible or statically indexed HTML render it from their own persisted copy with `@input/pen-export-html`, which is DOM-free and server-safe. Construct a headless editor from that copy, export, and destroy — do not expect the React tree to emit this HTML.

```ts
import { createHeadlessEditor } from "@input/pen-core";
import { htmlExporter } from "@input/pen-export-html";
import type { CRDTDocument } from "@input/pen-types";

declare const hostDocument: CRDTDocument;

const editor = createHeadlessEditor({ document: hostDocument });
const html = htmlExporter.export(editor);
editor.destroy();
```

Render that string as ordinary HTML next to the editor shell. The editor stays a client island; the exported markup is the host's content surface.

See the root README for the full package overview and licensing details.

## Options

`PenEditor` takes a required `editor` prop. This package has no create-function options. The optional peer `@input/pen-import-markdown` is not required to mount the editor.

`engines.node` is `>=22`. Required peers are `react` and `react-dom` (`^18` or `^19`).

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the Getting started page (`#/getting-started`) and the Server rendering page (`#/ssr`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
