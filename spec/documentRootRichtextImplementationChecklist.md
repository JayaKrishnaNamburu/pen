# DocumentRoot RichText Implementation Checklist

## Superseded

This checklist is superseded by `spec/flowModeImplementationChecklist.md`.

The preferred implementation direction is now block-native flow mode rather than a dual-root document architecture.

This checklist turns `spec/documentRootRichtextRfc.md` into a concrete implementation plan mapped to packages and symbols.

It is organized in dependency order so work can land incrementally without painting the architecture into a corner.

## Implementation Strategy

Build this in six layers:

1. root metadata and loading invariants
2. shared types and logical positions
3. root-aware core runtime
4. rich-text root CRDT and normalization
5. rendering and field-editor integration
6. commands, clipboard, import/export, and product presets

The sequence matters. Do not start with React rendering. The hardest coupling sits in types, selection, ops, and apply.

## Phase 0: RFC Integration

- [ ] Link `spec/documentRootRichtextRfc.md` from `spec/v01.md`
  - Package: `spec`
  - Files:
    - `spec/v01.md`
  - Symbols/sections:
    - `## 1. Vision`
    - `## 2. Design Principles`
    - `## 3. Architecture Overview`
  - Outcome:
    - The main spec acknowledges that Pen supports multiple authored root kinds inside a `DocumentScope`.

- [ ] Add follow-on references from wave specs
  - Package: `spec`
  - Files:
    - `spec/wave03EditorCore.md`
    - `spec/wave05ReactRendering.md`
    - `spec/crossBlockSelectionRfc.md`
    - optionally `spec/wave01CrdtLayer.md`
  - Outcome:
    - Existing wave docs stop assuming `blockOrder` is the only authored spine.

## Phase 1: Root Metadata and Loading Invariants

- [ ] Add root-kind metadata to the document contract
  - Package: `@pen/types`
  - Files:
    - `packages/types/src/types/crdt.ts`
    - `packages/types/src/types/editor.ts`
    - possibly `packages/types/src/types/selection.ts`
  - Symbols to introduce:
    - `DocumentRootKind = "block" | "richtext"`
    - `DocumentRootDescriptor`
  - Outcome:
    - Every `DocumentScope` can report which authored root kind it hosts.

- [ ] Add root-kind helpers to editor public types
  - Package: `@pen/types`
  - Files:
    - `packages/types/src/types/editor.ts`
  - Symbols to add or update:
    - `CreateEditorOptions`
    - `Editor`
    - `DocumentState`
    - `DocumentScope`
  - Suggested additions:
    - `CreateEditorOptions.rootKind?`
    - `Editor.documentRootKind`
    - `DocumentState.rootKind`
  - Outcome:
    - Callers can load or create a scope intentionally as `block` or `richtext`.

- [ ] Persist and read root kind from document metadata
  - Package: `@pen/crdt-yjs`
  - Files:
    - `packages/crdt/yjs/src/document.ts`
    - `packages/crdt/yjs/src/adapter.ts`
  - Symbols to add:
    - metadata key constant such as `ROOT_KIND`
    - helper like `getDocumentRootKind()`
    - helper like `setDocumentRootKind()`
  - Outcome:
    - A Yjs document declares its authored root shape explicitly.

- [ ] Make validation root-kind-aware
  - Package: `@pen/crdt-yjs`
  - Files:
    - `packages/crdt/yjs/src/document.ts`
    - `packages/crdt/yjs/src/__tests__/document.test.ts`
  - Symbols to update:
    - `validateDocument()`
    - `DocumentValidationError`
  - Outcome:
    - Validation rejects root-kind mismatch instead of silently assuming a block document.

## Phase 2: Shared Types and Logical Positions

- [ ] Replace block-only text addressing with generalized logical positions
  - Package: `@pen/types`
  - Files:
    - `packages/types/src/types/selection.ts`
    - `packages/types/src/types/documentRange.ts`
    - possibly `packages/types/src/types/editor.ts`
  - Symbols to introduce:
    - `LogicalTextPoint`
    - `BlockTextPoint`
    - `DocumentTextPoint`
    - root-aware `DocumentRange`
  - Outcome:
    - Text selection can address either block content or rich-text document tree content.

- [ ] Make selection state root-aware without losing existing APIs immediately
  - Package: `@pen/types`
  - Files:
    - `packages/types/src/types/selection.ts`
  - Symbols to update:
    - `TextSelection`
    - `SelectionState`
  - Suggested approach:
    - preserve current block-shaped overloads temporarily
    - add generalized point-based selection as the canonical form
  - Outcome:
    - Existing callers can migrate incrementally.

- [ ] Generalize document operations for root-aware text editing
  - Package: `@pen/types`
  - Files:
    - `packages/types/src/types/ops.ts`
  - Symbols to add:
    - rich-text-root operations such as:
      - `InsertDocumentTextOp`
      - `DeleteDocumentTextOp`
      - `FormatDocumentTextOp`
      - `InsertDocumentNodeOp`
      - `RemoveDocumentNodeOp`
  - Symbols to preserve:
    - all current block ops
  - Outcome:
    - `DocumentOp` can represent both block-root and rich-text-root mutations.

- [ ] Add root-specific state interfaces
  - Package: `@pen/types`
  - Files:
    - `packages/types/src/types/editor.ts`
  - Symbols to introduce:
    - `BlockDocumentState`
    - `RichTextDocumentState`
  - Outcome:
    - block-only code stops typechecking against a pretend universal block API.

## Phase 3: Root-Aware Session and Core Runtime

- [ ] Make `DocumentSession` expose root metadata per scope
  - Package: `@pen/core`
  - Files:
    - `packages/core/src/editor/documentSession.ts`
  - Symbols to update:
    - `DocumentSessionImpl`
    - `getScope()`
    - `rootScope`
  - Outcome:
    - A scope knows both where it lives and what root shape it contains.

- [ ] Make editor bootstrapping root-aware
  - Package: `@pen/core`
  - Files:
    - `packages/core/src/editor/editor.ts`
  - Symbols to update:
    - `EditorImpl.constructor`
    - `_bindSession()`
    - `_ensureInitialParagraph()`
    - `loadDocument()`
  - Outcome:
    - new scopes initialize either a `BlockRoot` or `RichTextRoot`, not always an empty paragraph block.

- [ ] Split root bootstrapping from editor orchestration
  - Package: `@pen/core`
  - Files:
    - `packages/core/src/editor/editor.ts`
    - add new file such as `packages/core/src/editor/documentRoot.ts`
  - Symbols to introduce:
    - `resolveDocumentRootKind()`
    - `ensureDocumentRoot()`
    - `createInitialBlockRoot()`
    - `createInitialRichTextRoot()`
  - Outcome:
    - root creation rules are centralized and testable.

- [ ] Make selection manager root-aware
  - Package: `@pen/core`
  - Files:
    - `packages/core/src/editor/selection.ts`
    - `packages/core/src/editor/range.ts`
    - `packages/core/src/__tests__/editorCore.test.ts`
  - Symbols to update:
    - `SelectionManagerImpl`
    - `DocumentRangeImpl`
    - `selectText()`
    - `selectTextRange()`
    - `getSelectedText()`
    - `replaceSelection()`
    - `deleteSelection()`
  - Outcome:
    - core selection behavior works correctly for both root kinds.

- [ ] Make apply pipeline dispatch on root-aware ops
  - Package: `@pen/core`
  - Files:
    - `packages/core/src/editor/apply.ts`
  - Symbols to update:
    - `ApplyPipeline`
    - `_validateOp()`
    - `_executeSingleOp()` or equivalent op dispatch points
    - `_opBlockId()` or affected-block tracking helpers
  - Outcome:
    - root-aware operations execute through the same pipeline, diagnostics, and undo grouping.

## Phase 4: RichTextRoot CRDT and Normalization

- [ ] Add `RichTextRoot` storage helpers to the Yjs layer
  - Package: `@pen/crdt-yjs`
  - Files:
    - `packages/crdt/yjs/src/document.ts`
    - `packages/crdt/yjs/src/__tests__/document.test.ts`
  - Symbols to introduce:
    - top-level key constant such as `RICHTEXT_ROOT`
    - `getRichTextRoot()`
    - `ensureRichTextRoot()`
  - Recommended Yjs type:
    - `Y.XmlFragment`
  - Outcome:
    - rich-text scopes have a native tree-shaped root.

- [ ] Add root-aware normalization
  - Package: `@pen/core`
  - Files:
    - `packages/core/src/schema/normalize.ts`
    - possibly split into:
      - `packages/core/src/schema/normalizeBlockRoot.ts`
      - `packages/core/src/schema/normalizeRichTextRoot.ts`
  - Symbols to update:
    - `SchemaEngineImpl`
    - `normalizeDirty()`
    - `normalizeAll()`
  - Outcome:
    - normalization no longer assumes every dirty target is a block.

- [ ] Define root-aware schema capability surface
  - Package: `@pen/types`
  - Files:
    - `packages/types/src/types/schema.ts`
    - `packages/types/src/types/fieldEditorCapabilities.ts`
  - Symbols to introduce or update:
    - root-level schema metadata
    - rich-text structural node descriptors
    - root-aware field editor behavior helpers
  - Outcome:
    - the schema layer can express both block-root and rich-text-root content rules.

## Phase 5: React Rendering and Field Editor

- [ ] Split content rendering by root kind
  - Package: `@pen/react`
  - Files:
    - `packages/rendering/react/src/primitives/editor/content.tsx`
    - add files such as:
      - `packages/rendering/react/src/primitives/editor/blockEditorContent.tsx`
      - `packages/rendering/react/src/primitives/editor/richTextEditorContent.tsx`
  - Symbols to introduce or refactor:
    - `EditorContent`
    - `useBlockList()`
  - Outcome:
    - the renderer no longer assumes top-level content is always a block list.

- [ ] Make field-editor session attach to either a block surface or a document surface
  - Package: `@pen/react`
  - Files:
    - `packages/rendering/react/src/field-editor/fieldEditorImpl.ts`
    - `packages/rendering/react/src/field-editor/controller.ts`
  - Symbols to update:
    - `FieldEditorImpl`
    - `FieldEditorSession`
    - session snapshot/state shape
  - Outcome:
    - editing lifecycle remains centralized while surface ownership becomes root-aware.

- [ ] Make DOM selection bridge root-aware
  - Package: `@pen/react`
  - Files:
    - `packages/rendering/react/src/field-editor/selectionBridge.ts`
    - `packages/rendering/react/src/field-editor/crossBlock.ts`
  - Symbols to update:
    - `domSelectionToEditor()`
    - logical point mapping helpers
  - Outcome:
    - browser selection maps correctly to either block points or rich-text tree positions.

- [ ] Preserve expanded block editing while adding native rich-text editing
  - Package: `@pen/react`
  - Files:
    - `packages/rendering/react/src/field-editor/fieldEditorImpl.ts`
    - `packages/rendering/react/src/primitives/editor/content.tsx`
    - `packages/rendering/react/src/primitives/editor/root.tsx`
  - Outcome:
    - cross-block editing keeps working in `BlockRoot`
    - rich-text scopes use a continuous editing surface by default

## Phase 6: Commands, Clipboard, and Input Behavior

- [ ] Audit every block-assuming command
  - Package: `@pen/react`
  - Files:
    - `packages/rendering/react/src/field-editor/commands.ts`
    - `packages/rendering/react/src/field-editor/keyHandling.ts`
  - Symbols to update:
    - enter handling
    - backspace handling
    - merge and split behavior
    - select-all behavior
  - Outcome:
    - commands route by root kind instead of assuming adjacent blocks.

- [ ] Make clipboard root-aware
  - Package: `@pen/react`
  - Files:
    - `packages/rendering/react/src/field-editor/clipboard.ts`
  - Outcome:
    - copy, cut, and paste work correctly for both roots.

- [ ] Make importer entrypoints root-aware
  - Packages:
    - `@pen/extensions/import-html`
    - markdown importer package if present
  - Files:
    - `packages/extensions/import-html/src/...`
  - Outcome:
    - importers can target `BlockRoot` or `RichTextRoot` intentionally.

- [ ] Make serializers and exporters root-aware
  - Packages:
    - `@pen/types`
    - `@pen/core`
    - schema/default package as needed
  - Files:
    - `packages/types/src/types/serialization.ts`
    - schema serialization definitions
  - Outcome:
    - export is driven by root kind instead of always walking blocks.

## Phase 7: Product Surface and Defaults

- [ ] Introduce a rich-text preset
  - Packages:
    - `@pen/core`
    - default schema package
    - `@pen/react`
  - Files:
    - `packages/core/src/index.ts`
    - `packages/schema/default/src/defs.ts`
    - `packages/rendering/react/src/penEditor.tsx`
  - Symbols to add:
    - `createRichTextEditor()` or preset equivalent
    - rich-text root schema preset
  - Outcome:
    - consumers can adopt the continuous editor mode without assembling low-level pieces manually.

- [ ] Add playground coverage for both roots
  - Package: playground
  - Files:
    - `playground/src/App.tsx`
    - related UI files
  - Outcome:
    - both authoring modes can be exercised side-by-side during development.

## Testing Checklist

- [ ] Add type-level tests for new shared types
  - Packages:
    - `@pen/types`

- [ ] Add Yjs root validation tests
  - Package:
    - `@pen/crdt-yjs`
  - Files:
    - `packages/crdt/yjs/src/__tests__/document.test.ts`

- [ ] Add editor core tests for root-aware selection and ops
  - Package:
    - `@pen/core`
  - Files:
    - `packages/core/src/__tests__/editorCore.test.ts`

- [ ] Add renderer tests for rich-text-root editing
  - Package:
    - `@pen/react`
  - Files:
    - add new tests near:
      - `packages/rendering/react/src/__tests__/regionSelection.test.tsx`
      - existing field-editor and selection tests

- [ ] Add clipboard and command tests for both roots
  - Packages:
    - `@pen/react`
    - importer/exporter packages as needed

## High-Risk Areas

- [ ] `packages/types/src/types/selection.ts`
  - Risk:
    - this is the most likely place to create awkward compatibility debt

- [ ] `packages/core/src/editor/apply.ts`
  - Risk:
    - op routing, diagnostics, affected-block tracking, and undo grouping are deeply block-shaped today

- [ ] `packages/core/src/schema/normalize.ts`
  - Risk:
    - normalization logic currently encodes structural assumptions about blocks and children arrays

- [ ] `packages/rendering/react/src/field-editor/selectionBridge.ts`
  - Risk:
    - DOM-to-model mapping gets much harder once the model supports both block points and tree positions

- [ ] `packages/rendering/react/src/primitives/editor/content.tsx`
  - Risk:
    - this file currently assumes list-of-blocks rendering in many interaction paths

## Suggested First Pull Requests

- [ ] PR 1: root-kind metadata and validation
  - Packages:
    - `@pen/types`
    - `@pen/crdt-yjs`

- [ ] PR 2: logical position types and root-aware selection contracts
  - Packages:
    - `@pen/types`
    - `@pen/core`

- [ ] PR 3: editor bootstrapping and root-aware apply pipeline scaffolding
  - Packages:
    - `@pen/core`

- [ ] PR 4: `RichTextRoot` Yjs storage plus normalization
  - Packages:
    - `@pen/crdt-yjs`
    - `@pen/core`

- [ ] PR 5: React content split and field-editor integration
  - Packages:
    - `@pen/react`

- [ ] PR 6: commands, clipboard, import/export, preset, and playground
  - Packages:
    - `@pen/react`
    - import/export packages
    - playground

## Definition Of Done

- [ ] `createEditor()` can create or load a `RichTextRoot` scope intentionally
- [ ] a rich-text scope edits as one continuous document surface
- [ ] `BlockRoot` remains fully supported
- [ ] `DocumentSession` and `DocumentScope` remain the orchestration layer for both roots
- [ ] `editor.apply()` and `editor.selection` remain canonical for both roots
- [ ] import/export paths are explicit about target root kind
- [ ] the public API makes Pen usable as either:
  - a structured block editor
  - a continuous rich-text editor
