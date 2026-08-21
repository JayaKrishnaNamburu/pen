# @input/pen-ai-suggestions

Proactive AI writing suggestions for Pen.

## Install

```bash
pnpm add @input/pen-ai-suggestions
```

## What It Does

`@input/pen-ai-suggestions` adds proactive writing suggestions on top of Pen. It watches user-originated edits, waits for a bounded debounce/stability window, asks a host-provided analyzer for structured suggestion candidates, and stages those candidates as inline suggestion marks that can be applied or dismissed.

The package is headless. It owns scheduling, scope building, matching, grouping, caching, and safe apply behavior. Renderer packages own presentation.

## Basic Setup

```ts
import { createEditor } from "@input/pen-core";
import { aiSuggestionsExtension } from "@input/pen-ai-suggestions";

const editor = createEditor({
  extensions: [
    aiSuggestionsExtension({
      analyzer: {
        async analyze({ scope, contextBefore, contextAfter }) {
          const response = await fetch("/api/ai", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              requestMode: "ai-suggestions",
              suggestionScope: {
                blockType: scope.blockType,
                targetText: scope.text,
                contextBefore,
                contextAfter,
              },
            }),
          });

          const payload = await response.json();
          return {
            candidates: payload.suggestions ?? [],
            usage: payload.usage,
          };
        },
      },
    }),
  ],
});
```

## Analyzer Contract

Your analyzer should return structured candidates rather than free-form text:

```ts
type AISuggestionCandidate = {
  kind: "spelling" | "grammar" | "rephrase" | "clarity";
  title: string;
  originalText: string;
  replacementText: string;
  reason?: string;
  confidence?: number;
};
```

The extension will:

- bound analysis to a local scope around the edit
- match `originalText` back onto the live document
- drop stale, overlapping, or low-confidence suggestions
- only apply a suggestion if the live document still matches when the user accepts it

## Common Tuning Options

```ts
import { aiSuggestionsExtension } from "@input/pen-ai-suggestions";
import type { AISuggestionsAnalyzer } from "@input/pen-ai-suggestions";

const analyzer: AISuggestionsAnalyzer = {
  async analyze() {
    return { candidates: [] };
  },
};

aiSuggestionsExtension({
  analyzer,
  debounceMs: 1000,
  minChangedChars: 10,
  minStableMs: 800,
  cooldownMs: 6500,
  maxScopeChars: 500,
  maxSuggestionsPerScope: 3,
  minConfidence: 0.8,
});
```

## Options

`mode` defaults to `"balanced"`. `enabled` defaults to `true`. The host must supply `analyzer`. Numeric defaults below are the balanced preset; `cheap` and `aggressive` replace the whole set.

| Option                   | Default (`balanced`) | Effect                              |
| ------------------------ | -------------------- | ----------------------------------- |
| `enabled`                | `true`               | Master switch                       |
| `mode`                   | `"balanced"`         | `cheap` / `balanced` / `aggressive` |
| `debounceMs`             | `1200`               | Wait after edits before analysis    |
| `minChangedChars`        | `12`                 | Minimum local change                |
| `minStableMs`            | `800`                | Stability window                    |
| `cooldownMs`             | `10000`              | Per-block cooldown                  |
| `maxScopeChars`          | `320`                | Bound on text sent for analysis     |
| `maxSuggestionsPerScope` | `3`                  | Cap visible suggestions per scope   |
| `minConfidence`          | `0.8`                | Drop weaker candidates              |
| `cacheTtlMs`             | `300000`             | Analyzer cache TTL                  |
| `dismissMemoryMs`        | `600000`             | Remember dismissed suggestions      |
| `groupGapChars`          | `3`                  | Grouping gap                        |

## Controller Access

Use the controller to inspect state or drive host behavior:

```ts
import { createEditor } from "@input/pen-core";
import {
  aiSuggestionsExtension,
  getAISuggestionsController,
} from "@input/pen-ai-suggestions";
import type { AISuggestionsAnalyzer } from "@input/pen-ai-suggestions";

const analyzer: AISuggestionsAnalyzer = {
  async analyze() {
    return { candidates: [] };
  },
};

const editor = createEditor({
  extensions: [aiSuggestionsExtension({ analyzer })],
});
const controller = getAISuggestionsController(editor);

controller?.request({ force: true });
controller?.applySuggestion("suggestion-id");
controller?.dismissSuggestion("suggestion-id");
```

The controller exposes:

- `getState()`
- `subscribe(listener)`
- `request(options?)`
- `applySuggestion(id)` / `applySuggestionGroup(id)`
- `dismissSuggestion(id)` / `dismissSuggestionGroup(id)`
- `setEnabled(enabled)`
- `getRuntimeSettings()` / `updateRuntimeSettings(patch)`

## React UI

`@input/pen-react` provides the current UI surface for proactive suggestions:

```tsx
import { createEditor } from "@input/pen-core";
import { aiSuggestionsExtension } from "@input/pen-ai-suggestions";
import { Pen } from "@input/pen-react";

const editor = createEditor({
  extensions: [
    aiSuggestionsExtension({
      analyzer: {
        async analyze() {
          return { candidates: [] };
        },
      },
    }),
  ],
});

export function SuggestionsSurface() {
  return (
    <Pen.Editor.Root editor={editor}>
      <Pen.AISuggestions.Root editor={editor}>
        <Pen.Editor.Content />
        <Pen.AISuggestions.Popover />
      </Pen.AISuggestions.Root>
    </Pen.Editor.Root>
  );
}
```

The React package also exposes hooks such as:

- `useAISuggestions(editor)`
- `useAISuggestionPopover(editor)`
- `useAISuggestionsMetrics(editor)`

## Notes

- This package is part of the Pen monorepo.
- Hosts should provide the analyzer and transport; this package does not bake in a model provider.
- Suggestions are advisory until explicitly applied.
- Runtime changes should still flow through `editor.apply(...)` so undo and diagnostics remain consistent.

## Facets and commands

Contributes the suggestions controller facet (`aiSuggestionsControllerFacet` / `AI_SUGGESTIONS_CONTROLLER_SLOT`). It contributes no commands. Requires no other extensions. The host must provide `analyzer`.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the AI features page (`#/ai`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
