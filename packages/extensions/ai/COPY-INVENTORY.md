# AI copy inventory (Wave L)

Unique library-owned user-visible strings in `packages/extensions/ai/src`. Prompt templates, playground planner internals, plan `label`/`reason` metadata (not rendered), `Error.message`, and diagnostic events stay English. React chrome is catalogued in `@input/pen-types` and resolved in `@input/pen-react`.

Kind: `button` (command-menu item text), `label` (command descriptions, shortcut descriptions, review chrome).

Bindings store catalog keys; `getCommands()` resolves them through `pen.messages`. Custom command literals stay as provided.

**Count: 16.**

| string | key | file | kind |
| --- | --- | --- | --- |
| Rewrite | `pen.ai.command.rewrite` | `src/commands/defaultCommands.ts` | button |
| Rewrite the selected text | `pen.ai.command.rewrite.description` | `src/commands/defaultCommands.ts` | label |
| Continue writing | `pen.ai.command.continue` | `src/commands/defaultCommands.ts` | button |
| Continue writing from the current position | `pen.ai.command.continue.description` | `src/commands/defaultCommands.ts` | label |
| Summarize | `pen.ai.command.summarize` | `src/commands/defaultCommands.ts` | button |
| Summarize the selected text | `pen.ai.command.summarize.description` | `src/commands/defaultCommands.ts` | label |
| Fix grammar | `pen.ai.command.fixGrammar` | `src/commands/defaultCommands.ts` | button |
| Fix grammar and spelling | `pen.ai.command.fixGrammar.description` | `src/commands/defaultCommands.ts` | label |
| Simplify | `pen.ai.command.simplify` | `src/commands/defaultCommands.ts` | button |
| Make the text simpler and more concise | `pen.ai.command.simplify.description` | `src/commands/defaultCommands.ts` | label |
| Expand | `pen.ai.command.expand` | `src/commands/defaultCommands.ts` | button |
| Expand the text with more detail | `pen.ai.command.expand.description` | `src/commands/defaultCommands.ts` | label |
| Translate | `pen.ai.command.translate` | `src/commands/defaultCommands.ts` | button |
| Translate to another language | `pen.ai.command.translate.description` | `src/commands/defaultCommands.ts` | label |
| Undo AI inline turn | `pen.ai.shortcut.undoInline` | `src/extension.ts` | label |
| Redo AI inline turn | `pen.ai.shortcut.redoInline` | `src/extension.ts` | label |
