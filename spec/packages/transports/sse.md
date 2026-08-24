# @input/pen-transport-sse

## Purpose

Server-Sent Events transport for Pen.

## Public Role

Provide transport-specific wiring around Pen protocols and sessions. The live `Editor` is a constructor argument on `createSSEHandler()`, not a field on the wire request.

## Key Exports / Entrypoints

- Export map: `.`
- Server: `createSSEHandler()`, `parsePenStreamRequest()`
- Client stream helper on the same root export
- Workspace scripts: `build`, `clean`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@input/pen-core`, `@input/pen-types`
- Peer dependencies: No peer dependencies declared.
- Boundary: Transport packages should stay below product policy and above raw network wiring.

## Data Flow / Runtime Model

`createSSEHandler` reads the POST body, rejects oversized or malformed JSON with HTTP 400, then runs `parsePenStreamRequest()`. That parser admits only the serializable `PenStreamRequest` keys. `context.editor` is not a valid field and fails the parse, so tool execution never sees a live editor handle from the network. The editor used for tool context is the one passed at handler construction.

Each `toolCalls` entry is authorized with `openAIToolCall()` before `toolRuntime.executeTool()`. A denied call sends `tool-error` and skips execution. The write guard is restored in `finally`, not `catch`, matching the direct transport: a non-throw unwind would otherwise leave the guard patched onto the host editor. `opened.close()` is idempotent and returns its first result on later calls (owned by `@input/pen-ai/tools`).

## Integration Notes

- Path in workspace: `packages/transports/sse`
- Spec path mirrors workspace path: `packages/transports/sse.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.

## Current Maturity / Intended Usage

Workspace package at version `0.0.1`; intended usage is current-state but still evolving.

## Non-goals

Do not make transports own editor behavior or auth policy.
