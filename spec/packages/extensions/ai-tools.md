# @input/pen-ai-tools

## Purpose

Canonical AI tool surface for Pen

## Public Role

Add optional runtime behavior on top of the editor core without changing the canonical mutation authority.

## Key Exports / Entrypoints

- Export map: `.`
- Workspace scripts: `build`, `clean`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@input/pen-core`, `@input/pen-document-ops`, `@input/pen-types`
- Peer dependencies: No peer dependencies declared.
- Boundary: Extensions compose through the core editor and slots/events rather than side channels.

## Data Flow / Runtime Model

`openAIToolCall()` authorizes a model-driven call and installs the write guard before the transport runs `executeTool`. Transports must not call `executeTool` unless the result is `{ ok: true }`.

`close()` on that opened call restores the patched `editor.apply` and is idempotent: the first result is stored, and later calls return that same result. The write guard is restored in `finally`, not `catch`. A non-throw unwind (abandoning a stream mid-`yield`) runs `finally` and skips `catch`; a `catch`-only restore left the guard patched onto the host editor and silently dropped every later `editor.apply` editor-wide.

The live `Editor` used for the guard is `ToolContext.editor` at construction. That is a local runtime field, not `PenStreamRequest.context.editor` (removed from the wire type).

## Integration Notes

- Path in workspace: `packages/extensions/ai-tools`
- Spec path mirrors workspace path: `packages/extensions/ai-tools.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.

## Current Maturity / Intended Usage

Workspace package at version `0.0.1`; intended usage is current-state but still evolving.

## Non-goals

Do not duplicate core editor authority or renderer ownership inside the extension.
