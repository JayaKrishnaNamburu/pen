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

See the root README for the full package overview and licensing details.
