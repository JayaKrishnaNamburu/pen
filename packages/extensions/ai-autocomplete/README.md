# `@input/pen-ai-autocomplete`

Low-latency inline autocomplete extension for Pen.

This package focuses on inline completion. It does not plan or review, and it does not ship a model adapter — the host owns adapters, auth, and UI. When a model is attached, outbound calls go through the shared `pen.aiEgress` facet from `@input/pen-core`.

## Install

```bash
pnpm add @input/pen-core @input/pen-ai-autocomplete
```

## What It Provides

- `autocompleteExtension(...)` to install the inline autocomplete runtime
- `getAutocompleteController()` to inspect and drive the controller
- `createAutocompleteProvider()` and `builtinAutocompleteProviders` for provider composition
- runtime types for policy, diagnostics, metrics, and controller snapshots

## Minimal Setup

```ts
import { createEditor } from "@input/pen-core";
import {
  autocompleteExtension,
  getAutocompleteController,
} from "@input/pen-ai-autocomplete";

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
- Generation, suggestions, and autocomplete share one `pen.aiEgress` facet. Install the filter from `@input/pen-core` (or the re-export on `@input/pen-ai`).

## Options

| Option                | Default                                  | Effect                              |
| --------------------- | ---------------------------------------- | ----------------------------------- |
| `debounceMs`          | `DEFAULT_DEBOUNCE_MS` (`100`)            | Delay before requesting a hint      |
| `prefetchAfterAccept` | `DEFAULT_PREFETCH_AFTER_ACCEPT` (`true`) | Prefetch the next hint after accept |

`autocompleteExtension()` accepts an empty config.

## Facets and commands

Contributes the autocomplete controller facet (`aiAutocompleteControllerFacet` / `AI_AUTOCOMPLETE_CONTROLLER_SLOT`). It contributes no commands. Requires no other extensions. It shares the inline-completion controller with `@input/pen-ai` when both are installed.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the AI features page (`#/ai`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
