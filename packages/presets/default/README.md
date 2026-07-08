# `@input/pen-preset-default`

`@input/pen-preset-default` packages the standard Pen runtime stack for most applications.

Use it when you want the default batteries-included editor setup:

- document tools via `@input/pen-document-ops`
- delta streaming via `@input/pen-delta-stream`
- undo via `@input/pen-undo`
- rich-text shortcuts via `@input/pen-shortcuts`

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";

const editor = createEditor({
  preset: defaultPreset(),
});
```

Customize individual default features with typed options:

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";

const editor = createEditor({
  preset: defaultPreset({
    shortcuts: {
      onToggleLink: (editor) => {
        // Open your app's link UI here.
        return true;
      },
    },
  }),
});
```

If you need full control over composition, skip the preset and register extensions yourself through `createEditor({ extensions: [...] })`.
