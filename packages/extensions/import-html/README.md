# `@pen/import-html`

HTML importer with sanitization for Pen.

## Install

```bash
pnpm add @pen/core @pen/import-html
```

## What It Provides

- `htmlImporter` for parsing and importing HTML into a Pen editor
- `parseHtmlToBlocks()` for block conversion without mutating the editor
- `sanitizeHTML()` for sanitizing incoming HTML before import

## Usage

```ts
import { createEditor } from "@pen/core";
import { htmlImporter } from "@pen/import-html";

const editor = createEditor();

await htmlImporter.import("<p>Hello <strong>Pen</strong></p>", editor, {
  replace: true,
});
```

## Integration Notes

- This package is intended for paste, import, and migration flows from HTML sources.
- Import goes through Pen's normal operation pipeline with `origin: "import"`.
- Sanitization is built in so host applications can treat HTML as untrusted input by default.
