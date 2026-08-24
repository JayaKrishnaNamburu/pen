# Document Model

## Purpose

Describe the document shape and read model that package specs build on.

## Core Concepts

- Pen uses one block-native document model.
- Blocks may contain inline content, structured child blocks, or specialized surfaces such as tables.
- `DocumentState` and `BlockHandle` provide the read model used by renderers, exporters, tools, and extensions.
- Selection may target text, blocks, or grid cells depending on the active surface.

## Invariants

- Full-document features must traverse the complete block tree rather than only top-level `blockOrder` entries.
- `editor.blocks()` / `editor.blockCount()` and `documentState.blocks` / `documentState.blockCount` are the same nested walk: they follow each top-level id in `blockOrder`, then that block's `children` array (nested blocks and layout containers). They had silently diverged — one walked children, the other stopped at `blockOrder` — and are now aligned. `documentState.blockOrder` remains the top-level sequence only.
- Profiles and view policies do not define alternate document roots.
- Structured blocks remain first-class document citizens even when authoring surfaces hide them from default insertion flows.
- Exporters preserve the authored document graph rather than applying UI visibility heuristics.
- An empty text-capable block stores `""` on its `Y.Text`. Stored length equals logical length. `BlockHandle.textContent()` and `textDeltas()` on that block are empty; they do not insert a caret sentinel.
- `\u200B` has no reserved meaning. A lone stored `"\u200B"` is healed to `""` on load (format stamp below 3) and when it arrives as a remote commit. A `\u200B` inside longer user text is preserved.
- The DOM empty-block placeholder is a renderer concern: one `<br data-pen-empty="">` child. It is never serialized. Field `textContent` and `extractTextFromDOM` read `""`. The caret overlay `data-offset` on an empty field is `0`.
