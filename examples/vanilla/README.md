# Vanilla example

Minimal Vite app that mounts Pen with `@input/pen-preset-default` and `@input/pen-dom`. `@input/pen-core` is the headless assembly point if you skip the preset.

This package is a workspace member (`examples/vanilla` in `pnpm-workspace.yaml`).

## Install

Consumer install:

```bash
pnpm add @input/pen-preset-default @input/pen-core @input/pen-dom yjs
```

`@input/pen-dom` has no extra peer dependencies. `yjs` is a peer of `@input/pen-crdt-yjs`, which `@input/pen-core` depends on, so every Pen install needs it.

## Mount

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { mountEditor } from "@input/pen-dom";

const editor = createEditor({
  preset: defaultPreset(),
});

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("Missing #app");
}

mountEditor(editor, root);
```

That file is `src/main.ts`. `mountEditor` is the same composition `@input/pen-react` and `@input/pen-vue` already assemble: `FieldEditorImpl`, the editor-root shell, and inline-content surfaces. Construct it in the browser, not during SSR.

Pen ships no required stylesheet — the editor is functional unstyled, including on an empty document. An empty paragraph's inline surface lays out at zero width, so activation resolves the clicked _block_ rather than the inline span; you do not need a `min-width` rule to land the first keystroke. The rule in this example's `index.html` is cosmetic. Tokens the `@input/pen-dom` overlays read are catalogued in `STYLING.md`, which ships inside the `@input/pen-react` package.

Client-only mount: `@input/pen-dom` is a browser module — construct `FieldEditorImpl` in the browser, not during SSR.

## Run from this repository

Requires Node 22+ and pnpm 9. From the repository root:

```bash
pnpm install
pnpm build
pnpm --filter @input/pen-example-vanilla dev
```

Vite serves the app at `http://localhost:5173`.
