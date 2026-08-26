# Capability matrix

Normative (`spec/rules/host.md` HB1). This document states, per surface, what each capability gives you. A capability absent from this document does not exist publicly; changing a cell is a spec-visible change.

`scripts/check-capability-matrix.mjs` (GATE 5.3) parses the tables below: every status must be in the vocabulary, and every claiming cell must name a path that exists and is not under `playground/`.

## Surfaces

| Surface | Package | Entry |
| --- | --- | --- |
| React | `@input/pen-react` | `PenEditor`, or the `Pen.*` primitives |
| Vue | `@input/pen-vue` | `PenEditor`, or `PenContent` / `PenBlock` |
| Vanilla | `@input/pen-dom` | `mountEditor(editor, root)`, or `FieldEditorImpl` directly |
| Headless | `@input/pen-core` | `createHeadlessEditor()` — no DOM |

## Status vocabulary

| Status | Means |
| --- | --- |
| `supported` | Works on this surface with the packages the row names, and the named path proves it on this surface. |
| `bring-your-own-ui` | The behavior and its state reach this surface; the binding ships no components for it. You render the chrome. |
| `not-supported` | Not reachable on this surface. Needs a different surface. |
| `planned` | Intended, not shipped. Do not build against it. |

`bring-your-own-ui` is the most common status here, and that is the matrix's main finding rather than a gap in it. Pen's capabilities live in `@input/pen-core`, `@input/pen-dom`, and the extensions; a binding's job is to mount and subscribe (HB2). So a capability usually reaches every DOM surface, and what differs between React and Vue is how much chrome ships with it. React carries the reference feature set — 18,030 source lines against Vue's 2,107 — and that spread is a difference in bundled UI, not in reach.

Two consequences worth stating plainly. Vue reaching React is not a goal: a Vue app that renders its own accept/reject buttons over the same decorations is using Pen as designed. And `bring-your-own-ui` is not a soft `not-supported` — the state is on an editor you already have, so the work is rendering, not plumbing.

## Editing

| Capability | React | Vue | Vanilla | Headless |
| --- | --- | --- | --- | --- |
| Single-block fields | `supported` — `packages/rendering/react/src/__tests__/fieldEditorCommands.01.test.ts` | `supported` — `packages/rendering/vue/src/__tests__/mount.test.ts` | `supported` — `packages/rendering/dom/src/__tests__/mountEditor.test.ts` | `not-supported` — interactive text entry needs a field editor, which needs a DOM |
| Expanded (multi-block) fields | `supported` — `packages/rendering/dom/src/field-editor/__tests__/expandedContentEditableBackend.test.ts` | `supported` — `packages/rendering/dom/src/field-editor/__tests__/expandedContentEditableBackend.test.ts` | `supported` — `packages/tooling/conformance/suites/overlays/o4-multiblock-native.spec.ts` | `not-supported` — as above |
| Table-cell editing | `supported` — `packages/rendering/react/src/__tests__/tableCellNavigation.test.ts` | `supported` — cells select and activate for editing: `packages/rendering/vue/src/__tests__/mount.test.ts` | `bring-your-own-ui` — `mountEditor` renders no table chrome; cell endpoints are `packages/rendering/dom/src/field-editor/__tests__/restoreCellEndpoints.test.ts` | `not-supported` — table ops apply, cell editing does not |
| Document mutation (`editor.apply`) | `supported` — `packages/core/src/__tests__/applyPipeline.contract.test.ts` | `supported` — `packages/core/src/__tests__/applyPipeline.contract.test.ts` | `supported` — `packages/core/src/__tests__/applyPipeline.contract.test.ts` | `supported` — `packages/core/src/__tests__/applyPipeline.contract.test.ts` runs without a DOM |

Expanded fields need no per-binding API: both bindings mount the same `FieldEditorImpl`, which owns the expanded backend, so the DOM-level test is the evidence for all three DOM surfaces.

## AI

| Capability | React | Vue | Vanilla | Headless |
| --- | --- | --- | --- | --- |
| AI review UI (accept/reject, diffs) | `supported` — `packages/rendering/react/src/__tests__/suggestionRendering.test.tsx` | `bring-your-own-ui` — decorations paint through the decoration composable; no accept/reject components. `packages/rendering/vue/src/__tests__/publicApi.test.ts` | `bring-your-own-ui` — adopt `PEN_REVIEW_STYLESHEET`; `packages/extensions/ai/src/__tests__/reviewPresentation.test.ts` | `bring-your-own-ui` — accept/reject APIs work without a DOM: `packages/extensions/ai/src/__tests__/reviewPresentation.test.ts` |
| Streaming preview | `supported` — `packages/rendering/react/src/__tests__/aiPrimitives.24.test.tsx` | `bring-your-own-ui` — preview decorations paint; no generation-zone or progress chrome. `packages/rendering/vue/src/__tests__/publicApi.test.ts` | `bring-your-own-ui` — `packages/extensions/ai/src/__tests__/reviewPresentation.streamingPreview.test.ts` | `bring-your-own-ui` — preview state is observable; nothing renders it. `packages/extensions/ai/src/__tests__/reviewPresentation.streamingPreview.test.ts` |
| Autocomplete (ghost text) | `supported` — `packages/rendering/react/src/__tests__/suggestionRendering.test.tsx` | `bring-your-own-ui` — the controller drives; no ghost rendering in the binding. `packages/extensions/ai/src/autocomplete/__tests__/extension.part5.test.ts` | `bring-your-own-ui` — `getAutocompleteController()`; `packages/extensions/ai/src/autocomplete/__tests__/extension.part5.test.ts` | `bring-your-own-ui` — the controller runs headlessly: `packages/extensions/ai/src/autocomplete/__tests__/extension.part5.test.ts` |

The three AI rows are the parity story HB1 exists to tell. All three capabilities reach every DOM surface, because the decorations come from `@input/pen-ai` through the shared inline-decoration pipeline. What React adds is chrome: the `@input/pen-react/ai` and `@input/pen-react/ai-suggestions` entrypoints. A Vue or vanilla host gets the same decorations and renders its own affordances.

## Presentation

| Capability | React | Vue | Vanilla | Headless |
| --- | --- | --- | --- | --- |
| Overlays (carets, selection rects, block outlines) | `supported` — `packages/rendering/react/src/__tests__/regionSelection.02.test.tsx` | `bring-your-own-ui` — Vue paints no overlays, as `packages/rendering/vue/STYLING.md` states; native selection still renders | `bring-your-own-ui` — geometry and overlay utilities ship; `mountEditor` mounts no layer. `packages/tooling/conformance/suites/overlays/o1-ordinary-native.spec.ts` | `not-supported` — overlays are geometry, which needs layout |
| Review surface styling | `supported` — `packages/extensions/ai/src/__tests__/rs4.stylingContract.test.ts` | `supported` — `packages/extensions/ai/src/__tests__/rs4.stylingContract.test.ts` | `supported` — `packages/extensions/ai/src/__tests__/rs4.stylingContract.test.ts` | `not-supported` — CSS needs a document |

The styling contract is `supported` everywhere it can be because it is one exported sheet plus one class vocabulary (RS4), not per-binding code: `PEN_REVIEW_STYLESHEET` from `@input/pen-dom`, class names from `@input/pen-types`.

## Data

| Capability | React | Vue | Vanilla | Headless |
| --- | --- | --- | --- | --- |
| Interop: programmatic import/export | `supported` — `packages/extensions/interop/src/__tests__/surface.sf2.formats.test.ts` | `supported` — `packages/extensions/interop/src/__tests__/surface.sf2.formats.test.ts` | `supported` — `packages/extensions/interop/src/__tests__/surface.sf2.formats.test.ts` | `supported` — `packages/extensions/interop/src/__tests__/surface.sf2.formats.test.ts` |
| Interop: paste importers | `supported` — importers are a prop; `packages/rendering/react/src/__tests__/htmlPasteDefault.test.ts` | `supported` — HTML importer is wired by default; `packages/rendering/vue/src/__tests__/mount.test.ts` | `supported` — `packages/rendering/dom/src/__tests__/clipboardPaste.test.ts` | `not-supported` — paste is a DOM event |
| Multiplayer | `supported` — `packages/rendering/react/src/__tests__/multiplayerCaretOverlay.test.tsx` | `bring-your-own-ui` — awareness state syncs; no presence or remote-caret components. `packages/extensions/multiplayer/src/__tests__/decorations.test.ts` | `bring-your-own-ui` — `packages/extensions/multiplayer/src/__tests__/decorations.test.ts` | `bring-your-own-ui` — sync works, remote carets need layout. `packages/extensions/multiplayer/src/__tests__/decorations.test.ts` |
| Undo | `bring-your-own-ui` — install `undoExtension()`; no binding hook. `packages/extensions/undo/src/__tests__/undoExtension.editor.test.ts` | `bring-your-own-ui` — keyboard undo works once installed; `packages/rendering/vue/src/__tests__/mount.part2.test.ts` | `bring-your-own-ui` — `packages/extensions/undo/src/__tests__/undoExtension.editor.test.ts` | `supported` — `packages/extensions/undo/src/__tests__/undoExtension.editor.test.ts` |
| History and attribution | `supported` — `packages/rendering/react/src/__tests__/historyMultiplayerHooks.test.tsx` | `bring-your-own-ui` — no composable; the extension's state is readable. `packages/extensions/history/src/__tests__/historyExtension.test.ts` | `bring-your-own-ui` — `packages/extensions/history/src/__tests__/historyExtension.test.ts` | `supported` — `packages/extensions/history/src/__tests__/historyExtension.test.ts` |

Undo is `bring-your-own-ui` on all three DOM surfaces because no binding exports an undo hook — the keyboard shortcut comes from the extension, so undo works without any binding code, and a custom undo button reads the extension. It is `supported` headlessly because there is no UI to be missing.

## Text tools

| Capability | React | Vue | Vanilla | Headless |
| --- | --- | --- | --- | --- |
| Search and replace | `supported` — `packages/rendering/react/src/__tests__/searchPrimitives.test.tsx` | `bring-your-own-ui` — the controller drives; no find UI. `packages/extensions/search/src/__tests__/search.test.ts` | `bring-your-own-ui` — `packages/extensions/search/src/__tests__/search.test.ts` | `bring-your-own-ui` — the controller runs headlessly: `packages/extensions/search/src/__tests__/search.test.ts` |
| Input rules | `bring-your-own-ui` — install `inputRulesExtension()`; no binding API. `packages/extensions/input-rules/src/__tests__/editorActivation.test.ts` | `bring-your-own-ui` — `packages/extensions/input-rules/src/__tests__/editorActivation.test.ts` | `bring-your-own-ui` — `packages/extensions/input-rules/src/__tests__/editorActivation.test.ts` | `bring-your-own-ui` — the engine runs, but typing-triggered rules need a field editor: `packages/extensions/input-rules/src/__tests__/extension.test.ts` |

Input rules have no chrome to ship, so no binding exports anything for them: `bring-your-own-ui` here means "install the extension", not "render something".

## What the matrix does not cover

Editor chrome beyond these capabilities — toolbars, slash menus, selection toolbars, prompt composers — ships only in `@input/pen-react` and is not a capability in the HB1 sense: it is application UI over the same public state, and a host is expected to build its own. It is out of scope here so that the matrix keeps saying something about reach rather than turning into a component index.
