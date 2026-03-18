# @pen/ai-suggestions

Proactive AI writing suggestions for Pen.

## Install

```bash
pnpm add @pen/ai-suggestions
```

## What It Does

`@pen/ai-suggestions` adds proactive writing suggestions on top of Pen. It watches user-originated edits, waits for a bounded debounce/stability window, asks a host-provided analyzer for structured suggestion candidates, and stages those candidates as inline suggestion marks that can be applied or dismissed.

The package is headless. It owns scheduling, scope building, matching, grouping, caching, and safe apply behavior. Renderer packages own presentation.

## Basic Setup

```ts
import { createEditor } from "@pen/core";
import { aiSuggestionsExtension } from "@pen/ai-suggestions";

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

Useful options:

- `enabled`: enable or disable the extension
- `mode`: use the built-in `cheap`, `balanced`, or `aggressive` preset
- `debounceMs`: wait after edits before considering analysis
- `minChangedChars`: require a minimum amount of local change before analysis
- `minStableMs`: require the block to remain stable before analysis
- `cooldownMs`: prevent repeated analysis of the same block too frequently
- `maxScopeChars`: bound how much text is sent for analysis
- `maxSuggestionsPerScope`: cap visible suggestions per scope
- `minConfidence`: filter weak candidates before rendering

## Controller Access

Use the controller to inspect state or drive host behavior:

```ts
import { getAISuggestionsController } from "@pen/ai-suggestions";

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

`@pen/react` provides the current UI surface for proactive suggestions:

```tsx
<Pen.Editor.Root editor={editor}>
  <Pen.AISuggestions.Root editor={editor}>
    <Pen.Editor.Content />
    <Pen.AISuggestions.Popover />
  </Pen.AISuggestions.Root>
</Pen.Editor.Root>
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
