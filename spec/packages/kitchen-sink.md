# @input/pen-kitchen-sink

## Purpose

Workspace package in the Pen monorepo.

## Public Role

Exercise the runtime and renderer surface in a local integration app. It was the workspace's `playground/` until 2026-08-25; that name now belongs to the small reference app (`packages/playground.md`), and this one keeps the breadth: every renderer surface, collaboration, suggestions, and the end-to-end suite (`pnpm test:e2e` runs `internal/kitchen-sink/e2e`).

In practice, the kitchen sink is also the integration harness for Pen's AI transport and streaming contracts. It should reflect shipped package behavior closely enough to catch drift between `@input/pen-ai`, `@input/pen-types`, and the host-side request pipeline.

## Key Exports / Entrypoints

- Export map: Package root only.
- Workspace scripts: `build`, `dev`, `dev:backend`, `dev:e2e`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@ai-sdk/anthropic`, `@input/pen-ai`, `@input/pen-assets-memory`, `@input/pen-core`, `@input/pen-crdt-yjs`, `@input/pen-interop`, `@input/pen-input-rules`, `@input/pen-multiplayer`, `@input/pen-preset-default`, `@input/pen-react`, `@input/pen-schema-default`, `@input/pen-search`, `@input/pen-shortcuts`, `@input/pen-types`, `@y/websocket-server`, `ai`, `dotenv`, `react`, `react-dom`, `ws`, `y-websocket`, `yjs`
- Peer dependencies: No peer dependencies declared.
- Boundary: This is a private app for development, experimentation, and demos.

## Data Flow / Runtime Model

Private app packages in Pen should stay package-first and explicit about ownership. Use it to validate end-to-end integration of shipped packages.

For AI flows, this app currently owns a thin but important server boundary:

- It hydrates a server-side editor from serialized client state and remaps client block ids to server block ids before handling requested operations.
- It validates requested-operation conflicts using the shared selection/range helpers and provenance checks.
- It builds local-operation prompts for bounded rewrites and removals.
- It requires local-operation model output to be wrapped in `<pen_local_operation>...</pen_local_operation>`.
- It streams typed local-operation frames such as `replace-preview`, `replace-final`, `insert-preview`, and `insert-final` back to the client.
- Preview extraction must suppress wrapper text, including partially streamed closing markers, so protocol framing never leaks into the document.
- It also exercises proactive AI suggestion flows by shipping a host analyzer for `@input/pen-ai/suggestions`, exposing tuning controls, and validating renderer behavior for underline, popover, apply, and dismiss lifecycle.

Important rules:

- Kitchen sink transport should mirror the shared `@input/pen-types` operation contract rather than inventing a app-only target shape.
- Local-operation prompts may be app-specific, but the resulting operation semantics must stay aligned with the AI extension's fast-apply and suggestion lifecycle.
- AI suggestion responses should stay structured and bounded so it remains an integration harness for the shared suggestion contract rather than a app-only heuristic branch.
- Private glue is acceptable here, but behavior that affects correctness should stay consistent with package contracts and corresponding specs.

## Integration Notes

- Path in workspace: `internal/kitchen-sink`
- Spec path mirrors workspace path: `packages/kitchen-sink.md`
- This package is private to the workspace and exists to support docs, demos, or local development flows.
- Its server is the main place where request/response streaming, local-operation payload parsing, and end-to-end AI validation are exercised together
- It also validates proactive AI suggestion integration across `@input/pen-ai/suggestions`, `@input/pen-react`, and the host analyzer boundary
- Changes here should be treated as integration behavior, not as an excuse to fork the runtime contract from shipped packages

## Current Maturity / Intended Usage

Private workspace app.

## Non-goals

Do not treat app-only glue as part of the public runtime contract.

Additional non-goals:

- Do not let app-specific request routing redefine the meaning of shared operation targets.
- Do not allow payload-wrapper narration or protocol framing to leak into editor-visible content.
