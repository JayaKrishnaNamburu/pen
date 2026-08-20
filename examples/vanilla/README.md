# Vanilla example

Minimal Vite app that mounts Pen with `@input/pen-preset-default` and `@input/pen-dom`. `@input/pen-core` is the headless assembly point if you skip the preset.

This package is **not on the pnpm workspace yet**. `pnpm-workspace.yaml` does not include `examples/*`, so `pnpm --filter @input/pen-example-vanilla` will not resolve until that membership lands.

## Install

Consumer install:

```bash
pnpm add @input/pen-preset-default @input/pen-core @input/pen-dom
```

`@input/pen-dom` has no extra peer dependencies.

## Mount

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { FieldEditorImpl } from "@input/pen-dom";

const editor = createEditor({
  preset: defaultPreset(),
});

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("Missing #app");
}

const fieldEditor = new FieldEditorImpl(editor);
fieldEditor.setRootElement(root);
```

That file is `src/main.ts`. `@input/pen-dom` is the field-editor engine; the host renders document blocks — `@input/pen-react` and `@input/pen-vue` do that for those hosts.

Pen ships no required stylesheet — the editor is functional unstyled. Tokens live in the `@input/pen-react` [STYLING.md](../../packages/rendering/react/STYLING.md) property reference.

Client-only mount: `@input/pen-dom` is a browser module — construct `FieldEditorImpl` in the browser, not during SSR.

## Run from this repository

Requires Node 22+ and pnpm 9. After `examples/*` is added to the workspace, from the repository root:

```bash
pnpm install
pnpm build
pnpm --filter @input/pen-example-vanilla dev
```

Vite serves the app at `http://localhost:5173`.
