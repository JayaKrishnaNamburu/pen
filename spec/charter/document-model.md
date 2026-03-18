# Document Model

## Purpose

Describe the document shape and read model that package specs build on.

## Core Concepts

- Pen uses one block-native document model.
- Blocks may contain inline content, structured child blocks, or specialized surfaces such as tables and databases.
- `DocumentState` and `BlockHandle` provide the read model used by renderers, exporters, tools, and extensions.
- Selection may target text, blocks, or grid cells depending on the active surface.

## Invariants

- Full-document features must traverse the complete block tree rather than only top-level `blockOrder` entries.
- Profiles and view policies do not define alternate document roots.
- Structured blocks remain first-class document citizens even when authoring surfaces hide them from default insertion flows.
- Exporters preserve the authored document graph rather than applying UI visibility heuristics.
