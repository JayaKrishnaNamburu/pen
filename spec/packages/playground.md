# @input/pen-playground

## Purpose

Workspace package in the Pen monorepo.

## Public Role

The reference app: the shortest honest example of embedding Pen. Someone who has never seen this repository should be able to clone it, run `pnpm dev`, and read the whole app in one sitting.

It stays narrow on purpose. A surface is added here only when a first-time embedder needs to see it — editor, AI agent, document inspector, optional collaboration. Package tests and the examples cover the rest.

## Key Exports / Entrypoints

- Export map: Package root only.
- Workspace scripts: `build`, `dev`, `dev:e2e`, `typecheck`, `lint`
- Client entry: `src/main.tsx` mounts `src/App.tsx`, a three-pane shell over one `Editor`.
- Server entry: `server/aiPlugin.ts` and `server/collaborationPlugin.ts`, Vite middleware that serves `POST /api/chat` and the Yjs websocket at `/collaboration`. There is no second process to start.

## Dependencies And Boundaries

- Runtime dependencies: `@input/pen-ai`, `@input/pen-core`, `@input/pen-crdt-yjs`, `@input/pen-input-rules`, `@input/pen-multiplayer`, `@input/pen-preset-default`, `@input/pen-react`, `@input/pen-types`, `@y/websocket-server`, `react`, `react-dom`, `ws`, `yjs`, `y-websocket`
- Peer dependencies: No peer dependencies declared.
- Boundary: This is a private app for development, experimentation, and demos.
- It resolves Pen from built packages rather than source aliases, so it fails the way a real consumer would when an export map or `dist` build is wrong.

## Data Flow / Runtime Model

One editor, three panes, no mirrored state. The chat sidebar and the inspector both read and write the same `Editor` instance, which is why they cannot disagree with the document.

- `src/editor/usePenEditor.ts` owns the editor's lifecycle and seeds the starter document with a single `apply` at `origin: "system"`. It also assigns `window.penPlayground.editor` so Playwright can reach the live instance.
- `src/chat/useChat.ts` sends prompts through `runPrompt` and keeps a receipt of each turn. The agent's answer arrives as document content or tool calls, never as chat prose, so the transcript records what changed rather than replaying a reply.
- `src/ai/penModel.ts` is the `ModelAdapter`: it posts to `/api/chat` and translates newline-delimited JSON back into `ModelStreamEvent`s. A browser-saved Anthropic key from the agent bar is sent as `x-anthropic-api-key` and wins over the server env key for that request.
- `server/chatRoute.ts` picks a backend per request — Anthropic when `ANTHROPIC_API_KEY` is set, `server/scriptedModel.ts` when it is not — so a fresh clone with no key still streams.
- `src/collaboration/` joins an optional Yjs room from the toolbar; the editor is recreated with `multiplayerExtension` when a session exists. A `?room=` link without a stored display name opens the join card rather than loading a private document under a shared URL. `EditorPane` keys `Pen.Editor.Root` to `editor.internals.viewId`, because a field editor is bound to one instance for its lifetime and a swapped-in editor would otherwise be driven by the previous one's DOM.
- Joining waits for the room before writing anything. Every editor is born with one empty paragraph, and the CRDT merges it like any other insert, so `usePenEditor` remembers that block and deletes it once a room with content arrives — otherwise each join would leave a blank block behind.
- `src/inspector/useDocumentSnapshot.ts` reads block tree, generation, and selection back out of the editor on `commit` and `selectionChange`; nothing in the app keeps a second copy.
- `src/ui/` holds the interface primitives as simplified ports of Input's design system, in plain CSS over `src/styles/tokens.css`. They are presentation only: no primitive imports from `editor/`, `chat/`, or `inspector/`, and none of them knows Pen exists. The agent bar's new-chat and API-key buttons are `Button.Icon` plus `Icon.Plus` and `Icon.Anthropic`.

Important rules:

- The wire format between `penModel.ts` and the server is a named subset of `ModelStreamEvent` (`server/protocol.ts`), not a shape of its own. A chat needs four event types; keeping the subset explicit is what makes the file readable.
- The scripted model answers in whichever form Pen asked for: tools in the request mean structural edits, no tools mean prose for a block. It exists to make the request contract visible, not to simulate a model.
- The UI layer stays dependency-free. A ported primitive that would need Radix, framer-motion, or an icon package is either simplified until it does not, or left out.
- Prefer deleting a feature here over explaining it.

## Integration Notes

- Path in workspace: `playground`
- Spec path mirrors workspace path: `packages/playground.md`
- This package is private to the workspace and exists to support docs, demos, or local development flows.
- `pnpm test:e2e` drives `playground/e2e` against `dev:e2e` on port 4173.
- `playground/README.md` is the contributor-facing tour and should stay true to the file layout.

## Current Maturity / Intended Usage

Private workspace app.

## Non-goals

Do not treat playground-only glue as part of the public runtime contract.

Additional non-goals:

- Not a feature showcase. Coverage of every extension lives in package tests.
- Not a chat product. The document is the output surface; the sidebar is a receipt.
- No abstraction that exists only to look professional. A reader should be able to follow every hop from keystroke to document without a diagram.
