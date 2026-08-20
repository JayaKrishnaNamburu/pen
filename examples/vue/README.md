# Vue example

Minimal Vite + Vue app that mounts Pen with `@input/pen-preset-default`. `@input/pen-core` is the headless assembly point if you skip the preset.

This package is **not on the pnpm workspace yet**. `pnpm-workspace.yaml` does not include `examples/*`, so `pnpm --filter @input/pen-example-vue` will not resolve until that membership lands.

## Install

Consumer install, including peers:

```bash
pnpm add @input/pen-preset-default @input/pen-core @input/pen-vue vue
```

`vue` is a peer of `@input/pen-vue`.

## Mount

```vue
<script setup lang="ts">
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { PenEditor } from "@input/pen-vue";

const editor = createEditor({
  preset: defaultPreset(),
});
</script>

<template>
  <PenEditor :editor="editor" />
</template>
```

That file is `src/App.vue`. Mount it from a browser entry (`src/main.ts` calls `createApp(App).mount("#app")`).

Pen ships no required stylesheet — the editor is functional unstyled. Tokens live in the `@input/pen-react` [STYLING.md](../../packages/rendering/react/STYLING.md) property reference.

Client-only mount: Vue has no `"use client"` directive, so `@input/pen-vue` does not emit one — mount `PenEditor` in the browser, not during SSR.

## Run from this repository

Requires Node 22+ and pnpm 9. After `examples/*` is added to the workspace, from the repository root:

```bash
pnpm install
pnpm build
pnpm --filter @input/pen-example-vue dev
```

Vite serves the app at `http://localhost:5173`.
