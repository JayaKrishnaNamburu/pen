# `@input/pen-input-rules`

Opt-in markdown autoformat for Pen.

This package is intentionally **not** included in `defaultPreset()`. Library users enable it only when they want markdown-style typing shortcuts. It does not ship a renderer or a keymap.

## Install

```bash
pnpm add @input/pen-input-rules
```

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { inputRulesExtension } from "@input/pen-input-rules";

const editor = createEditor({
  preset: defaultPreset(),
  extensions: [inputRulesExtension()],
});
```

Without the extension:

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";

const editor = createEditor({
  preset: defaultPreset(),
});
```

markdown autoformat remains disabled.

## What it adds

Block shortcuts:

- `# ` through `###### ` -> headings
- `- `, `* `, `+ ` -> bullet list
- `1. ` -> numbered list
- `[ ] `, `[x] ` -> checklist
- `> ` -> blockquote
- ` ``` ` -> code block
- `---`, `***`, `___` -> divider
- `> [!note] ` -> callout

Inline shortcuts:

- `**text**` -> bold
- `*text*` -> italic
- `` `text` `` -> code
- `~~text~~` -> strikethrough
- `==text==` -> highlight

## Notes

- This package is headless and renderer-agnostic.
- `@input/pen-react` keeps a small fallback list-input convenience path, but full markdown autoformat lives here.
- If you want custom rules, pass them through `inputRulesExtension({ rules, inlineRules })`.

## Options

| Option                      | Default | Effect                         |
| --------------------------- | ------- | ------------------------------ |
| `disableDefaults`           | `false` | Skip the built-in block rules  |
| `disableDefaultInlineRules` | `false` | Skip the built-in inline rules |
| `rules`                     | unset   | Extra block rules              |
| `inlineRules`               | unset   | Extra inline rules             |

## Facets and commands

Contributes no facet providers and no commands. The extension publishes a rules engine on `inputRulesEngineFacet` and rewrites matching input from `onBeforeApply`. Requires no other extensions. `defaultPreset()` does not install it.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the Extensions and facets page (`#/extensions`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
