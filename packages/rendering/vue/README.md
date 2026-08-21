# `@input/pen-vue`

Vue rendering primitives for Pen.

`@input/pen-vue` is the first non-React renderer in the Pen monorepo. It is intentionally lean: it proves that editor lifecycle, rendering, selection, decorations, and field-editor integration are not tied to React.

This package does not ship a stylesheet or a preset. `PenEditor` mounts the shared DOM field-editor engine from `@input/pen-dom`.

## Install

```bash
pnpm add @input/pen-vue vue
```

## Quick Start

```ts
import { createApp } from "vue";
import { PenVuePlugin, useEditor } from "@input/pen-vue";

const app = createApp({
  setup() {
    const editor = useEditor();
    return { editor };
  },
});

app.use(PenVuePlugin);
app.mount("#app");
```

```vue
<template>
  <PenEditor :editor="editor" empty-placeholder="Start writing..." />
</template>
```

You can also import the components directly instead of registering the plugin:

```ts
import { PenEditor, useEditor } from "@input/pen-vue";
```

## Public Surface

- `PenEditor`, `PenContent`, `PenBlock`, `PenInlineContent`, `PenFieldEditor`
- `useEditor`, `useSelection`, `useBlockList`, `useDecorations`
- `PenVuePlugin`
- `RendererOverrides` and paste importer types

## Example

```ts
import { defineComponent, h } from "vue";
import { PenEditor, useEditor } from "@input/pen-vue";

export const PenExample = defineComponent({
  name: "PenExample",
  setup() {
    const editor = useEditor();

    return () =>
      h(PenEditor, {
        editor,
        emptyPlaceholder: "Write something...",
      });
  },
});
```

## Notes

- Client-only mount: Vue has no `"use client"` directive, so this package does not emit one — mount `PenEditor` in the browser.
- Pen ships no required stylesheet — the editor is functional unstyled. The HOST6 styling contract is [STYLING.md](./STYLING.md).
- `PenEditor` installs the shared DOM field-editor engine from `@input/pen-dom`.
- Renderer overrides let host apps customize block rendering without forking the editor runtime.
- Paste importers can be passed through the `importers` prop on `PenEditor`.

## Options

`PenEditor` takes a required `editor` prop. `emptyPlaceholder` is optional and has no package default — omit it when you do not want placeholder copy. `importers` is optional.

`engines.node` is `>=22`. The required peer is `vue` (`^3.4.0`).

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the Getting started page (`#/getting-started`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
