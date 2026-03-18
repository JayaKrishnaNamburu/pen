# @pen/react

React renderer, primitives, and hooks for Pen.

`@pen/react` is the batteries-included renderer surface. If you want clearer optional-feature boundaries, you can import the dedicated subpaths: `@pen/react/ai`, `@pen/react/ai-suggestions`, `@pen/react/search`, `@pen/react/history`, and `@pen/react/multiplayer`.

## Install

```bash
pnpm add @pen/core @pen/preset-default @pen/react react react-dom
```

## Quick Start

```tsx
import { createEditor } from "@pen/core";
import { defaultPreset } from "@pen/preset-default";
import { PenEditor } from "@pen/react";

const editor = createEditor({
  preset: defaultPreset(),
});

export function App() {
  return <PenEditor editor={editor} />;
}
```

See the root README for the full package overview and licensing details.
