# @input/pen-undo

Undo/redo extension with origin tagging for Pen

## Install

```bash
pnpm add @input/pen-undo
```

## Stack depth

`undoExtension({ maxDepth })` caps how many undo/redo stack items are retained (CH7). The default is `DEFAULT_UNDO_MAX_DEPTH` (500). Y.UndoManager has no native cap; the Yjs adapter trims the oldest `undoStack` / `redoStack` items when a new stack item is added past the limit. This package accepts the option and default — it does not reimplement the trim.

```ts
import { undoExtension, DEFAULT_UNDO_MAX_DEPTH } from "@input/pen-undo";

undoExtension();
undoExtension({ maxDepth: DEFAULT_UNDO_MAX_DEPTH });
undoExtension({ maxDepth: 100 });
```

## Tracked origins

By default, undo tracks `user`, `ai`, and `import`. `collaborator`, `unknown`, and `migration` stay untracked, so remote edits, unclassified ops, and document upgrades cannot be undone locally.

## Notes

This package is part of the Pen monorepo. Pair it with the relevant core, schema, rendering, or extension packages for your editor setup.
