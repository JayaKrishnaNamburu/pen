# `@input/pen-ai`

AI extension, suggest mode, review state, and planning/runtime helpers for Pen.

`@input/pen-ai` is headless. It does not ship a model adapter, transport, or UI.

## Install

```bash
pnpm add @input/pen-core @input/pen-ai
```

Most app integrations also pair it with a renderer such as `@input/pen-react`.

## What It Provides

- `aiExtension(...)` to install Pen's headless AI runtime
- controller accessors such as `getAIController()` and `getAIReviewController()`
- suggest-mode and persistent-suggestion helpers
- planning, mutation-receipt, and review utilities used by richer AI workflows

## Minimal Setup

```ts
import { createEditor } from "@input/pen-core";
import { aiExtension, getAIController } from "@input/pen-ai";

const editor = createEditor({
  extensions: [
    aiExtension({
      suggestMode: true,
      author: "Ada",
    }),
  ],
});

const ai = getAIController(editor);
```

## Integration Notes

- `@input/pen-ai` is headless. It installs runtime behavior and controller state, not a fixed UI.
- Suggest mode lets AI-authored edits flow through Pen's suggestion and review pipeline instead of immediately replacing document content.
- The host application still owns model adapters, auth, transport, and any product-specific orchestration.
- Playground request planning (`buildPlaygroundRequestPlan` and related helpers) lives in the playground app, not this package.

## Typical Pairing

- `@input/pen-core` for editor authority and document mutation
- `@input/pen-react` for AI surfaces, prompts, and review UI
- `@input/pen-ai-autocomplete` or `@input/pen-ai-suggestions` for narrower inline flows
- `@input/pen-document-ops` when AI actions should route through document tools

## Options

| Option        | Default       | Effect                                             |
| ------------- | ------------- | -------------------------------------------------- |
| `suggestMode` | `false`       | Stage AI edits for review instead of applying them |
| `author`      | `"assistant"` | Author label stored on AI-originated suggestions   |

`aiExtension()` requires the `document-ops`, `delta-stream`, and `undo` extensions (`dependencies` on the extension record). `defaultPreset()` installs those three.

## Facets and commands

Contributes `beforeApplyFacet` (`pen.beforeApply`) when suggest mode is on, plus the AI controller facets read by `getAIController` and `getAIReviewController`. Commands: `ai:rewrite`, `ai:continue`, `ai:summarize`, `ai:fix-grammar`, `ai:simplify`, `ai:expand`, `ai:translate`. Key bindings cover inline undo/redo. Requires `document-ops`, `delta-stream`, and `undo`.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the AI features page (`#/ai`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
