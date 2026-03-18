# @pen/search

Document search and replacement primitives for Pen.

This package is published publicly as part of the Pen source-available SDK. Production use requires a license from Input.

## Install

```bash
pnpm add @pen/search
```

## What It Provides

- a headless search controller
- query navigation and replacement operations
- document-wide search across blocks and grid-backed cell content

This package is renderer-agnostic. Renderer packages can bind the controller state to UI primitives.

The packaged extension keeps the runtime contract broad:

- search, navigation, and replace work across blocks, tables, and databases
- active grid matches reveal by selecting the containing cell
- the built-in search decoration helper only highlights block-text matches today

Cell-specific visual highlighting needs a richer decoration surface than the current block/inline model.
