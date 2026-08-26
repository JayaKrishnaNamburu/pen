<!-- markdownlint-disable MD033 MD041 -->
<img width="100%" height="auto" alt="logo_black@2x" src="https://github.com/user-attachments/assets/99f65689-7be3-4b33-b21a-8959584adb8e" />

<h3 align="center">
  Headless, extension-first rich text<br/>editor engine for AI collaboration
</h3>

<p align="center">
  <a href="https://github.com/input-systems/pen/stargazers"><img src="https://img.shields.io/github/stars/input-systems/pen?style=flat&color=8D30FF" alt="GitHub stars" /></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-FF2B6E" alt="license" /></a>
</p>
<!-- markdownlint-enable MD033 MD041 -->

# Pen

Pen is an MIT-licensed SDK. Packages are intended for the public npm registry.

The first release train has not been published (every package is `0.0.1`). Until it is, `pnpm add @input/pen-*` 404s on the public registry. Clone this repository, run `pnpm install` and `pnpm build`, and consume the built workspace artifacts. The commands below are the post-publish install path.

Versioning is `0.x`; v3 ships as 0.3. The policy lives in [`spec/rules/api.md`](spec/rules/api.md) (API7).

```bash
pnpm add @input/pen-core @input/pen-preset-default @input/pen-react react react-dom yjs y-protocols
```

`react` and `react-dom` are peers of `@input/pen-react`. `yjs` and `y-protocols` are peers of `@input/pen-crdt-yjs`, which `@input/pen-core` depends on, so every Pen install needs both — including non-collaborative ones, since the document model is a Yjs document and the adapter imports awareness. `yjs` is a peer rather than a dependency so that exactly one copy is resolved; the adapter asserts that at document creation and fails loudly if a second copy is present. Package managers that auto-install peers will add them for you, but naming them explicitly is what pins the versions you get.

## What Pen Is

Pen is a package-first editor toolkit built around a headless runtime, schema-driven document model, and explicit extension composition. The core editor owns document state, selection, normalization, and mutation authority, while renderer packages bind that runtime to React or Vue.

## Quick Start

The smallest recommended setup uses the core runtime, the default preset, and the React renderer. Bare `createEditor()` installs no schema and no extensions. Without `preset: defaultPreset()`, `editor.undoManager` is an inert stub and Mod-Z does nothing, silently.

```tsx
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { PenEditor } from "@input/pen-react";

const editor = createEditor({
  preset: defaultPreset(),
});

export function App() {
  return <PenEditor editor={editor} />;
}
```

`PenEditor` is the fastest path. The editor is functional unstyled, including on an empty document — no extra CSS is required to land a click or the first keystroke. If you want to own the shell, layout, and controls, use the compound primitives directly.

## Examples

Minimal Vite apps for each host live at [`examples/react`](examples/react), [`examples/vue`](examples/vue), and [`examples/vanilla`](examples/vanilla). Each starts with `@input/pen-preset-default`; `@input/pen-core` is the assembly point if you skip the preset.

Each example is a pnpm workspace member, so `pnpm --filter @input/pen-example-react dev` resolves from a fresh clone, and all three are covered by a CI job that mounts the editor and types into it.

## Headless UI Examples

Pen keeps runtime state and document mutation in the editor. Your app can subscribe to that state and render any UI system around it.

### Editor Example

This example keeps Pen headless where it matters while still giving you a batteries-included editor surface in React.

```bash
pnpm add @input/pen-ai @input/pen-input-rules @input/pen-search @input/pen-shortcuts
```

Those commands 404 until the first publish. From a clone, the same packages resolve as workspace members after `pnpm install` and `pnpm build`.

```tsx
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { inputRulesExtension } from "@input/pen-input-rules";
import { searchExtension, getSearchController } from "@input/pen-search";
import { Pen } from "@input/pen-react";

const editor = createEditor({
  preset: defaultPreset(),
  extensions: [inputRulesExtension(), searchExtension()],
});

export function App() {
  return (
    <Pen.Editor.Root editor={editor}>
      <section className="editor-shell">
        <header className="editor-toolbar">
          <button
            type="button"
            onClick={() => getSearchController(editor)?.toggleOpen()}
          >
            Search
          </button>
        </header>

        <Pen.Search.Root editor={editor}>
          <Pen.Search.Input />
          <Pen.Search.Results />
          <Pen.Search.Previous>Previous</Pen.Search.Previous>
          <Pen.Search.Next>Next</Pen.Search.Next>
        </Pen.Search.Root>

        <Pen.Editor.Content />
      </section>
    </Pen.Editor.Root>
  );
}
```

You can stop at `PenEditor`, compose `Pen.*` primitives, or replace the UI entirely with your own controls.

### Bring Your Own Toolbar

`useToolbar(editor)` exposes formatting state, and `@input/pen-shortcuts` gives you reusable formatting commands. That lets you render your own toolbar shell without giving up Pen's selection-aware behavior.

```tsx
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { toggleInlineMark } from "@input/pen-shortcuts";
import { Pen, useToolbar } from "@input/pen-react";

const editor = createEditor({
  preset: defaultPreset(),
});

function FormattingToolbar() {
  const toolbar = useToolbar(editor);
  const currentBlockId =
    editor.selection?.type === "text" ? editor.selection.anchor.blockId : null;

  function handleHeading() {
    if (!currentBlockId) {
      return;
    }

    editor.apply(
      [
        {
          type: "set-props",
          blockId: currentBlockId,
          props: { type: "heading" },
        },
      ],
      { origin: "user" },
    );
  }

  return (
    <div className="toolbar">
      <button
        type="button"
        disabled={!toolbar.canBold}
        aria-pressed={Boolean(toolbar.activeMarks.bold)}
        onClick={() => toggleInlineMark(editor, "bold")}
      >
        Bold
      </button>
      <button
        type="button"
        disabled={!toolbar.canItalic}
        aria-pressed={Boolean(toolbar.activeMarks.italic)}
        onClick={() => toggleInlineMark(editor, "italic")}
      >
        Italic
      </button>
      <button type="button" disabled={!currentBlockId} onClick={handleHeading}>
        Heading
      </button>
      <span>Block: {toolbar.blockType ?? "paragraph"}</span>
    </div>
  );
}

export function App() {
  return (
    <Pen.Editor.Root editor={editor}>
      <FormattingToolbar />
      <Pen.Editor.Content />
    </Pen.Editor.Root>
  );
}
```

### Bring Your Own AI UI

`@input/pen-ai` owns sessions, generation state, and suggest-mode behavior. In React, you can wire that state into your own chat panel, action bar, or review surface.

```tsx
import { useState } from "react";
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { aiExtension } from "@input/pen-ai";
import { Pen, useAI, useAIActions, useAISessions } from "@input/pen-react";

const editor = createEditor({
  preset: defaultPreset(),
  extensions: [
    aiExtension({
      model: {
        async *stream() {
          yield {
            type: "text-delta" as const,
            delta: "Here is a clearer version of the selected text.",
          };
          yield { type: "done" as const };
        },
      },
    }),
  ],
});

function AIPanel() {
  const [prompt, setPrompt] = useState("Rewrite the selection to be clearer.");
  const ai = useAI(editor);
  const sessions = useAISessions(editor);
  const actions = useAIActions(editor);
  const latestSession = sessions[sessions.length - 1] ?? null;

  async function handleSubmit() {
    const session = actions.startSession({
      surface: "bottom-chat",
      target: "selection",
    });

    if (!session) {
      return;
    }

    await actions.runSessionPrompt(session.id, prompt, {
      target: "selection",
    });
  }

  return (
    <aside className="ai-panel">
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <div className="ai-actions">
        <button
          type="button"
          disabled={prompt.length === 0 || ai.status !== "idle"}
          onClick={() => void handleSubmit()}
        >
          Ask AI
        </button>
        <button type="button" onClick={() => actions.openCommandMenu()}>
          Commands
        </button>
      </div>
      <p>Status: {ai.status}</p>
      <p>
        Latest session:{" "}
        {latestSession
          ? `${latestSession.status} with ${latestSession.turns.length} turn(s)`
          : "none"}
      </p>
    </aside>
  );
}

export function App() {
  return (
    <Pen.Editor.Root editor={editor}>
      <AIPanel />
      <Pen.Editor.Content />
    </Pen.Editor.Root>
  );
}
```

If you want less custom UI code, `@input/pen-react` also ships `Pen.Toolbar.*` and `Pen.AI.*` primitives on top of the same runtime.

## Recommended Packages

- `@input/pen-core`: create editors and access the headless runtime
- `@input/pen-types`: contracts and shared type-level helpers
- `@input/pen-schema-default`: default blocks and inline definitions
- `@input/pen-preset-default`: standard runtime composition for most adopters
- `@input/pen-react`: primary documented renderer surface
- `@input/pen-crdt-yjs`: Yjs adapter for collaborative setups

## Optional Capabilities

### Rendering

- `@input/pen-vue`: shipped Vue renderer proof built on the shared DOM engine
- `@input/pen-dom`: shared DOM field-editor engine and low-level DOM helpers

### Editing And Extensions

- `@input/pen-search`: document search and replacement primitives
- `@input/pen-input-rules`: opt-in markdown shortcut typing
- `@input/pen-undo`: undo and redo with origin tagging
- `@input/pen-shortcuts`: headless keyboard shortcut extension
- `@input/pen-history`: snapshot history and attribution primitives
- `@input/pen-document-ops`: document tool and generation-zone helpers

### AI

- `@input/pen-ai`: AI extension, suggest mode, and track changes. Subpaths: `./suggestions`, `./autocomplete`, `./tools`, `./skills`, `./stream`

### Collaboration And Transport

- `@input/pen-multiplayer`: multiplayer presence and sync primitives
- `@input/pen-transport-direct`: in-process transport
- `@input/pen-transport-sse`: Server-Sent Events transport

### Import And Export

- `@input/pen-interop`: HTML, Markdown, JSON, and XML import and export (`./html`, `./markdown`, `./json`, `./xml`)

## Architecture

Pen keeps one block-native document model and one canonical mutation path.

- `editor.apply(...)` is the runtime authority boundary for document writes.
- `DocumentOp[]` is the mutation currency shared across runtime features.
- Extensions compose optional behavior without replacing the editor authority boundary.
- Renderer packages stay separate from the core runtime.
- JSON is the canonical machine-readable format. XML exists for interoperability.

For the full current-state package and architecture specs, see [spec/README.md](spec/README.md).

## Browser and Node Support

This table is the canonical HOST3 runtime floor. Wave D's docs content set should link here rather than restating the numbers.

| Runtime         | Minimum | Input backend                                                                           |
| --------------- | ------- | --------------------------------------------------------------------------------------- |
| Node            | `>=22`  | n/a (headless)                                                                          |
| Chromium        | 93      | contenteditable on 93–120; EditContext when `EditContext` is a function (Chromium 121+) |
| Firefox         | 92      | contenteditable                                                                         |
| Safari / WebKit | 15.4    | contenteditable                                                                         |

Expanded field-editor mode and table-cell editing always use contenteditable, even when EditContext is present (`fieldEditorImplRuntime.ts` backend selection).

**How the floor was chosen (HOST3 / HOST4).** Node is `>=22` because every current workflow (`ci.yml`, `release.yml`, `docs.yml`) pins `setup-node` to 22. HOST4's Node-reachable bare APIs are older (`Object.hasOwn` 16.9.0, `Array.prototype.at` 16.6.0) and E.5 marks both as trivially replaceable; declaring 16.9.0 would be an unverified range (API7). The browser floor is the newest bare HOST4 API, not a round "last two versions" cut: `Object.hasOwn` (Chrome 93, Firefox 92, Safari 15.4) sits above `Array.prototype.at` (92 / 90 / 15.4) and `replaceChildren` (86 / 78 / 14). APIs newer than that floor — EditContext, `structuredClone`, `ResizeObserver`, `color-mix()`, `crypto.randomUUID` — are feature-detected with a documented fallback (HOST4) and do not raise the minimum. Raising the floor is a minor-version change; lowering it is never silent.

Published packages declare the Node floor as `engines.node: ">=22"`. CI verifies the declared endpoints (22 and current Node 26) plus one non-Linux runner in [`.github/workflows/node-matrix.yml`](.github/workflows/node-matrix.yml).

## Repository Resources

- `packages/docs`: repository docs app for the current public Pen surface
- `.github/workflows/docs.yml`: GitHub Pages deployment for the docs app (Pages is enabled on this repository)
- `playground`: the reference app — editor, AI agent, document inspector, optional collaboration — and the host for `pnpm test:e2e`

## Development

```bash
pnpm install
pnpm lint
pnpm build
pnpm test
pnpm typecheck
```

`pnpm lint` runs Prettier on an explicit docs/config path list, then ESLint. TypeScript source is not in the Prettier list; ESLint owns source style. See `CONTRIBUTING.md`.

## Community

- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Support](SUPPORT.md)

## Authors

Pen is created by [Input B.V.](https://www.input.so/).

## License

The Pen SDK is provided under the [MIT License](LICENSE.md).

Copyright (c) 2026-present Input B.V.
