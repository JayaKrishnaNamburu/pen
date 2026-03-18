# `@pen/vue`

Vue rendering primitives for Pen.

`@pen/vue` is the first non-React renderer in the Pen monorepo. It is intentionally lean: it proves that editor lifecycle, rendering, selection, decorations, and field-editor integration are not tied to React.

## Install

```bash
pnpm add @pen/vue vue
```

## Quick Start

```ts
import { createApp } from "vue";
import { PenVuePlugin, useEditor } from "@pen/vue";

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
import { PenEditor, useEditor } from "@pen/vue";
```

## Public Surface

- `PenEditor`, `PenContent`, `PenBlock`, `PenInlineContent`, `PenFieldEditor`
- `useEditor`, `useSelection`, `useBlockList`, `useDecorations`
- `PenVuePlugin`
- `RendererOverrides` and paste importer types

## Example

```ts
import { defineComponent, h } from "vue";
import { PenEditor, useEditor } from "@pen/vue";

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

- `PenEditor` installs the shared DOM field-editor engine from `@pen/dom`.
- Renderer overrides let host apps customize block rendering without forking the editor runtime.
- Paste importers can be passed through the `importers` prop on `PenEditor`.
