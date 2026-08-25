# @input/pen-playground

## Purpose

Workspace package in the Pen monorepo.

## Public Role

The reference app: the shortest honest example of embedding Pen. Someone who has never seen this repository should be able to clone it, run `pnpm dev`, and read the whole app in one sitting.

It is deliberately narrow. Breadth — every renderer surface, collaboration, suggestions, the end-to-end suite — lives in the maintainer kitchen sink (`packages/kitchen-sink.md`). When a new surface needs exercising, it goes there. This app only grows when the thing being added is part of what a first-time embedder needs to understand.

## Key Exports / Entrypoints

- Export map: Package root only.
- Workspace scripts: `build`, `dev`, `typecheck`, `lint`
- Client entry: `src/main.tsx` mounts `src/App.tsx`, a three-pane shell over one `Editor`.
- Server entry: `server/aiPlugin.ts`, a Vite middleware that serves `POST /api/chat`. There is no second process to start.

## Dependencies And Boundaries

- Runtime dependencies: `@input/pen-ai`, `@input/pen-core`, `@input/pen-input-rules`, `@input/pen-preset-default`, `@input/pen-react`, `@input/pen-types`, `react`, `react-dom`
- Peer dependencies: No peer dependencies declared.
- Boundary: This is a private app for development, experimentation, and demos.
- It resolves Pen from built packages rather than source aliases, so it fails the way a real consumer would when an export map or `dist` build is wrong.

## Data Flow / Runtime Model

One editor, three panes, no mirrored state. The chat sidebar and the inspector both read and write the same `Editor` instance, which is why they cannot disagree with the document.

- `src/editor/usePenEditor.ts` owns the editor's lifecycle and seeds the starter document with a single `apply` at `origin: "system"`.
- `src/chat/useChat.ts` sends prompts through `runPrompt` and keeps a receipt of each turn. The assistant's answer arrives as document content or tool calls, never as chat prose, so the transcript records what changed rather than replaying a reply.
- `src/ai/penModel.ts` is the `ModelAdapter`: it posts to `/api/chat` and translates newline-delimited JSON back into `ModelStreamEvent`s.
- `server/chatRoute.ts` picks a backend per request — Anthropic when `ANTHROPIC_API_KEY` is set, `server/scriptedModel.ts` when it is not — so a fresh clone with no key still streams.
- `src/inspector/useDocumentSnapshot.ts` reads block tree, revision, and selection back out of the editor on every change; nothing in the app keeps a second copy.

Important rules:

- The wire format between `penModel.ts` and the server is a named subset of `ModelStreamEvent` (`server/protocol.ts`), not a shape of its own. A chat needs four event types; keeping the subset explicit is what makes the file readable.
- The scripted model answers in whichever form Pen asked for: tools in the request mean structural edits, no tools mean prose for a block. It exists to make the request contract visible, not to simulate a model.
- Prefer deleting a feature here over explaining it. Anything that needs a paragraph of caveats belongs in the kitchen sink.

## Integration Notes

- Path in workspace: `playground`
- Spec path mirrors workspace path: `packages/playground.md`
- This package is private to the workspace and exists to support docs, demos, or local development flows.
- The app is not covered by `pnpm test:e2e`; that suite drives the kitchen sink.
- `playground/README.md` is the contributor-facing tour and should stay true to the file layout.

## Current Maturity / Intended Usage

Private workspace app.

## Non-goals

Do not treat playground-only glue as part of the public runtime contract.

Additional non-goals:

- Not a feature showcase. Coverage of every extension is the kitchen sink's job.
- Not a chat product. The document is the output surface; the sidebar is a receipt.
- No abstraction that exists only to look professional. A reader should be able to follow every hop from keystroke to document without a diagram.
