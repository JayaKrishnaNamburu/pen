# AI copy inventory (Wave L)

Inventory only. No localization wiring and no source edits.

Unique library-owned user-visible strings in `packages/extensions/ai/src`. Tests, model prompt templates, playground planner internals, plan `label`/`reason` metadata (not rendered), `Error.message`, diagnostic events, and status/button chrome in `@input/pen-react` (L.5 / L.7) are out.

Kind: `button` (command-menu item text), `label` (command descriptions, shortcut descriptions, review chrome). This package has no library-owned `error` or `placeholder` UI strings.

Composed/counted strings are one row each (LOC6). Duplicate literals share a row; `file` is the definition site.

**Count: 34.**

| string | file | kind |
| --- | --- | --- |
| Rewrite | `src/commands/defaultCommands.ts` | button |
| Rewrite the selected text | `src/commands/defaultCommands.ts` | label |
| Continue writing | `src/commands/defaultCommands.ts` | button |
| Continue writing from the current position | `src/commands/defaultCommands.ts` | label |
| Summarize | `src/commands/defaultCommands.ts` | button |
| Summarize the selected text | `src/commands/defaultCommands.ts` | label |
| Fix grammar | `src/commands/defaultCommands.ts` | button |
| Fix grammar and spelling | `src/commands/defaultCommands.ts` | label |
| Simplify | `src/commands/defaultCommands.ts` | button |
| Make the text simpler and more concise | `src/commands/defaultCommands.ts` | label |
| Expand | `src/commands/defaultCommands.ts` | button |
| Expand the text with more detail | `src/commands/defaultCommands.ts` | label |
| Translate | `src/commands/defaultCommands.ts` | button |
| Translate to another language | `src/commands/defaultCommands.ts` | label |
| Undo AI inline turn | `src/extension.ts` | label |
| Redo AI inline turn | `src/extension.ts` | label |
| Replace text | `src/runtime/reviewArtifacts/previews.ts` | label |
| Insert text | `src/runtime/reviewArtifacts/previews.ts` | label |
| Append text | `src/runtime/reviewArtifacts/previews.ts` | label |
| Updates the selected text range. | `src/runtime/reviewArtifacts/build.ts` | label |
| `Flow patch: {operation}` | `src/runtime/reviewArtifacts/build.ts` | label |
| `Block "{blockId}"` | `src/runtime/reviewArtifacts/build.ts` | label |
| `Span "{spanId}"` | `src/runtime/reviewArtifacts/build.ts` | label |
| Blocks | `src/runtime/reviewArtifacts/build.ts` | label |
| Insert block | `src/runtime/reviewArtifacts/build.ts` | label |
| `Adds a new {blockType} block.` | `src/runtime/reviewArtifacts/build.ts` | label |
| Update block | `src/runtime/reviewArtifacts/build.ts` | label |
| Updates block properties. | `src/runtime/reviewArtifacts/build.ts` | label |
| `{count} prop changes` | `src/runtime/reviewArtifacts/build.ts` | label |
| Move block | `src/runtime/reviewArtifacts/build.ts` | label |
| Moves this block to a new position. | `src/runtime/reviewArtifacts/build.ts` | label |
| Convert block | `src/runtime/reviewArtifacts/build.ts` | label |
| `Converts this block to {newType}.` | `src/runtime/reviewArtifacts/build.ts` | label |
| (new block) | `src/runtime/reviewArtifacts/build.ts` | label |
