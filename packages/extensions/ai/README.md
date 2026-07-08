# `@input/pen-ai`

AI extension, suggest mode, review state, and planning/runtime helpers for Pen.

This package is published publicly as part of the Pen source-available SDK. Production
use requires a license from Input.

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

## Typical Pairing

- `@input/pen-core` for editor authority and document mutation
- `@input/pen-react` for AI surfaces, prompts, and review UI
- `@input/pen-ai-autocomplete` or `@input/pen-ai-suggestions` for narrower inline flows
- `@input/pen-document-ops` when AI actions should route through document tools
