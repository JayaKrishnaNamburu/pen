# @input/pen-transport-direct

## Purpose

In-process transport for Pen

## Public Role

Provide transport-specific wiring around Pen protocols and sessions.

## Key Exports / Entrypoints

- Export map: `.`
- `directTransport()` and `DirectTransportOptions`. `toolRuntime` is required; construction throws without it.
- Workspace scripts: `build`, `clean`, `lint`, `test`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@input/pen-ai`, `@input/pen-core`, `@input/pen-types`
- Peer dependencies: No peer dependencies declared.
- Boundary: Transport packages should stay below product policy and above raw network wiring. The `@input/pen-ai` dependency is for tool authorization (`openAIToolCall`, `createAIToolTurn`), not for AI orchestration.

## Data Flow / Runtime Model

In-process transport. The live `Editor` is a `directTransport({ editor })` constructor option. `PenStreamRequest` has no `editor` field; direct never reads one off the request.

Each `toolCalls` entry is authorized with `openAIToolCall()` before `toolRuntime.executeTool()`. A denied call yields `tool-error` and skips execution. The write guard installed for the call is restored in `finally`, not `catch`: abandoning a stream mid-`yield` resumes the generator with a return completion, which runs `finally` and skips `catch`. A `catch`-only restore left a read-only guard patched onto the host editor and silently dropped later writes. `opened.close()` is idempotent and returns its first result on later calls (owned by `@input/pen-ai/tools`).

## Integration Notes

- Path in workspace: `packages/transports/direct`
- Spec path mirrors workspace path: `packages/transports/direct.md`
- This package is part of the current package surface and should stay aligned with the headless runtime architecture.

## Current Maturity / Intended Usage

Workspace package at version `0.0.1`; intended usage is current-state but still evolving.

## Non-goals

Do not make transports own editor behavior or auth policy.
