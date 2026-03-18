# `@pen/ai-autocomplete`

Low-latency inline autocomplete extension for Pen.

## Install

```bash
pnpm add @pen/core @pen/ai-autocomplete
```

## What It Provides

- `autocompleteExtension(...)` to install the inline autocomplete runtime
- `getAutocompleteController()` to inspect and drive the controller
- `createAutocompleteProvider()` and `builtinAutocompleteProviders` for provider composition
- runtime types for policy, diagnostics, metrics, and controller snapshots

## Minimal Setup

```ts
import { createEditor } from "@pen/core";
import {
  autocompleteExtension,
  getAutocompleteController,
} from "@pen/ai-autocomplete";

const editor = createEditor({
  extensions: [
    autocompleteExtension({
      debounceMs: 150,
      prefetchAfterAccept: true,
    }),
  ],
});

const autocomplete = getAutocompleteController(editor);
```

## Integration Notes

- This package focuses on inline completion, not broader AI planning or review flows.
- The controller exposes runtime settings, block policy, provider registration, and accept/dismiss actions.
- Host applications still own model adapters, auth, request routing, and UI affordances for surfaced suggestions.
