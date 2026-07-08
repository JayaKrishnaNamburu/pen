# `@input/pen-import-markdown`

Markdown importer for Pen.

## Install

```bash
pnpm add @input/pen-core @input/pen-import-markdown
```

## What It Provides

- `markdownImporter` for parsing and importing Markdown into a Pen editor
- `parseMarkdownToBlocks()` for block conversion without mutating the editor

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { markdownImporter } from "@input/pen-import-markdown";

const editor = createEditor();

markdownImporter.import("# Hello\n\nThis came from Markdown.", editor, {
  replace: true,
});
```

## Integration Notes

- This package is useful for paste, file import, and migration flows from Markdown content.
- Like the other importers, it applies edits through Pen's import operation path instead of bypassing editor authority.
- Use `parseMarkdownToBlocks()` when you want to inspect or transform the converted blocks before applying them.
