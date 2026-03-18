# @pen/playground

## Purpose

Workspace package in the Pen monorepo.

## Public Role

Exercise the runtime and renderer surface in a local integration app.

In practice, the playground is also the integration harness for Pen's AI transport and streaming contracts. It should reflect shipped package behavior closely enough to catch drift between `@pen/ai`, `@pen/types`, and the host-side request pipeline.

## Key Exports / Entrypoints

- Export map: Package root only.
- Workspace scripts: `build`, `dev`, `dev:backend`, `dev:e2e`, `typecheck`

## Dependencies And Boundaries

- Runtime dependencies: `@ai-sdk/anthropic`, `@pen/ai`, `@pen/ai-autocomplete`, `@pen/ai-suggestions`, `@pen/ai-skills`, `@pen/ai-tools`, `@pen/assets-memory`, `@pen/core`, `@pen/crdt-yjs`, `@pen/database`, `@pen/export-html`, `@pen/export-markdown`, `@pen/import-html`, `@pen/import-markdown`, `@pen/input-rules`, `@pen/multiplayer`, `@pen/preset-default`, `@pen/react`, `@pen/schema-default`, `@pen/search`, `@pen/shortcuts`, `@pen/types`, `@y/websocket-server`, `ai`, `dotenv`, `react`, `react-dom`, `ws`, `y-websocket`, `yjs`
- Peer dependencies: No peer dependencies declared.
- Boundary: This is a private app for development, experimentation, and demos.

## Data Flow / Runtime Model

Private playground app packages in Pen should stay package-first and explicit about ownership. Use it to validate end-to-end integration of shipped packages.

For AI flows, the playground currently owns a thin but important server boundary:

- It hydrates a server-side editor from serialized client state and remaps client block ids to server block ids before handling requested operations.
- It validates requested-operation conflicts using the shared selection/range helpers and provenance checks.
- It builds local-operation prompts for bounded rewrites and removals.
- It requires local-operation model output to be wrapped in `<pen_local_operation>...</pen_local_operation>`.
- It streams typed local-operation frames such as `replace-preview`, `replace-final`, `insert-preview`, and `insert-final` back to the client.
- Preview extraction must suppress wrapper text, including partially streamed closing markers, so protocol framing never leaks into the document.
- It also exercises proactive AI suggestion flows by shipping a host analyzer for `@pen/ai-suggestions`, exposing playground tuning controls, and validating renderer behavior for underline, popover, apply, and dismiss lifecycle.

Important rules:

- Playground transport should mirror the shared `@pen/types` operation contract rather than inventing a playground-only target shape.
- Local-operation prompts may be playground-specific, but the resulting operation semantics must stay aligned with the AI extension's fast-apply and suggestion lifecycle.
- AI suggestion responses should stay structured and bounded so the playground remains an integration harness for the shared suggestion contract rather than a playground-only heuristic branch.
- Private glue is acceptable here, but behavior that affects correctness should stay consistent with package contracts and corresponding specs.

## Integration Notes

- Path in workspace: `playground`
- Spec path mirrors workspace path: `packages/playground.md`
- This package is private to the workspace and exists to support docs, demos, or local development flows.
- The playground server is the main place where request/response streaming, local-operation payload parsing, and end-to-end AI validation are exercised together
- The playground also validates proactive AI suggestion integration across `@pen/ai-suggestions`, `@pen/react`, and the host analyzer boundary
- Changes here should be treated as integration behavior, not as an excuse to fork the runtime contract from shipped packages

## Current Maturity / Intended Usage

Private workspace app.

## Non-goals

Do not treat playground-only glue as part of the public runtime contract.

Additional non-goals:

- Do not let playground-specific request routing redefine the meaning of shared operation targets.
- Do not allow payload-wrapper narration or protocol framing to leak into editor-visible content.
