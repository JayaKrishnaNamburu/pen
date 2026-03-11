# Cross-Block Selection RFC

## Status

Proposed.

This RFC translates the existing selection and field-editor requirements in `spec/v01.md`, `spec/wave-03-editor-core.md`, and `spec/wave-05-react-rendering.md` into an implementation architecture for cross-block selection and editing.

It is intended to guide implementation work for the current post-wave-06 debugging effort in the playground and to resolve ambiguity around selection ownership, expanded field-editor behavior, and fallback policy.

## Problem

The current implementation partially models cross-block selection in types and core, but the runtime editing surface still behaves like a single-block editor with a separate block-selection fallback.

This creates three mismatches:

1. `TextSelection` and `DocumentRange` already support multi-block semantics, but core mutation helpers still mostly operate on a single block.
2. The React layer often routes cross-block intent directly into `BlockSelection`, which prevents smooth expansion into an editable multi-block surface.
3. `FieldEditorImpl` currently mixes editing-session concerns and range-surface concerns, which makes it hard to expand across blocks without destabilizing focus, backend attachment, and IME behavior.

The result is that selecting across blocks does not feel like one continuous editing session, which violates the selection model and field-editor expansion strategy specified in the main spec.

## Spec Constraints

This RFC assumes and preserves the following requirements from the existing spec:

- `SelectionState` is first-class and includes `TextSelection`, `BlockSelection`, and other non-text selection forms.
- `TextSelection` is directional via `anchor` and `focus`.
- `DocumentRange` is the normalized range primitive for direction-agnostic operations.
- Cross-block selection is an expand-on-drag, contract-on-collapse interaction.
- The field editor remains CRDT-first. DOM input is intent, not source of truth.
- Expanded selection must work across mixed block types.
- Blocks with specialized or non-inline editing may participate in the expanded selection even if they are not directly editable from the outer surface.
- Large selections must not expand indefinitely.
- IME safety remains non-negotiable. Expansion and contraction must not fight composition state.

## Goals

- Make small cross-block selection a canonical `TextSelection`, not an ad hoc block-only mode.
- Preserve one logical document selection model across core, rendering, clipboard, and future collaboration features.
- Support a true expanded field-editor surface that spans multiple selected blocks.
- Keep field-editor session ownership stable across focus churn, selection changes, and backend updates.
- Support mixed block ranges in expanded mode.
- Provide a clear fallback policy for large selections and select-all behavior.
- Land changes in phases without painting the implementation into a corner.

## Non-Goals

- This RFC does not fully redesign specialized editing for code blocks or tables.
- This RFC does not define first-class mobile touch selection handles beyond preserving compatibility with the existing spec direction.
- This RFC does not require immediate implementation of every optimization implied by the final architecture.

## Core Principles

### 1. One Canonical Selection Model

`editor.selection` is the only semantic truth for what is selected.

- Small cross-block ranges are `TextSelection`.
- Structural-only selection remains `BlockSelection`.
- `DocumentRange` is the normalized execution primitive for all range-targeted operations.

No renderer-owned shadow selection model should redefine document semantics.

### 2. One Editing Session Model

`FieldEditorImpl` owns editing-session lifecycle, not document-selection truth.

It is responsible for:

- whether an editing session is active
- which block is the session focus block
- which backend is attached
- focus state and backend lifecycle

It is not responsible for inventing a second canonical notion of what is selected.

### 3. One Derived Surface Model

The visible editing surface is derived from:

- canonical selection
- active field-editor session
- range size policy
- per-block role inside an expanded surface

This allows the editor to preserve stable session ownership while still expanding or contracting the visible editing surface around the canonical selection.

## Architecture

## A. Selection and Range in Core

Core must treat multi-block text selection as a real editing target.

### Required behavior

- `selectTextRange(anchor, focus)` creates canonical multi-block `TextSelection`.
- `getSelectedText()` respects normalized range order across blocks.
- `getSelectedBlocks()` returns all blocks covered by the range, not only the anchor block.
- `replaceSelection()` and `deleteSelection()` support multi-block text ranges.
- Multi-block replacement batches delete and insert work in a single mutation transaction so undo grouping remains correct.

### Why this belongs in core

Selection replacement, clipboard, undo, search, collaboration, and range-aware tools all depend on normalized document semantics. If cross-block replacement is implemented only in the renderer, the system remains inconsistent and future features must reimplement the same logic.

## B. Field Editor Session vs Surface

`FieldEditorImpl` should be split conceptually into authored session state and derived surface state.

### Authored session state

Owned directly by `FieldEditorImpl`:

- `focusBlockId`
- `isEditing`
- `isFocused`
- current backend instance
- attached DOM element
- root DOM element

### Derived surface state

Computed from the authored session plus canonical selection:

- `mode: "inactive" | "single" | "expanded" | "block"`
- `activeBlockIds`
- later, if needed, `expandedBlockRoles`

### Invariant

`focusBlockId` remains session-owned. It must not flap on every selection change.

This is required to keep:

- backend lifecycle stable
- IME composition safe
- focus management predictable
- click-to-activate behavior understandable

## C. Expanded Surface

Expanded mode is a real editing surface, not just metadata.

The expanded surface renders all blocks covered by the selected cross-block range in document order inside one shared host.

Conceptually:

```html
<div data-pen-expanded-root contenteditable="true">
  <div data-block-id="b1" data-surface-role="editable-inline">...</div>
  <div
    data-block-id="b2"
    data-surface-role="structural"
    contenteditable="false"
  >
    ...
  </div>
  <div data-block-id="b3" data-surface-role="delegated" contenteditable="false">
    ...
  </div>
</div>
```

This aligns with the existing spec requirement that mixed block types participate in one expanded field-editor range.

## D. Per-Block Role in Expanded Mode

Each block in an expanded range gets one role:

- `editable-inline`
- `structural`
- `delegated`

### `editable-inline`

Blocks whose inline content can be edited directly by the outer expanded surface:

- paragraph
- heading
- bullet / numbered / check list item
- blockquote
- callout
- toggle text content
- other inline-richtext blocks following the same contract

### `structural`

Blocks that participate in the native browser selection range but are not directly editable from the outer surface:

- image
- divider
- any `fieldEditor: "none"` block

These are rendered with `contenteditable="false"` within the expanded surface.

### `delegated`

Blocks that participate in range selection but use specialized editing semantics:

- code block
- table
- future specialized editors

These are also rendered as non-inline-editable from the outer expanded surface. Entering them for direct editing is a delegated action handled by specialized input logic.

### Important consequence

The presence of `structural` or `delegated` blocks inside a small range does not automatically force fallback to `BlockSelection`.

That fallback-by-incompatibility rule is too weak for the spec and is explicitly rejected by this RFC.

## E. Backend Strategy

### Single-block mode

Keep the current backend strategy:

- `EditContext` when available
- `ContentEditable` fallback otherwise

This remains the hot path for ordinary editing.

### Expanded mode

Use a dedicated shared `contenteditable` backend.

Rationale:

- expanded mode requires one native browser selection space
- mixed block roles map naturally to nested `contenteditable="false"` islands
- `EditContext` is ideal for a single text buffer, not a mixed structural surface

Expanded mode is therefore a surface-specific backend, not a slight variation of the single-block backend.

## F. Selection Bridge

`selectionBridge.ts` becomes the canonical mapper between browser selection endpoints and logical `{ blockId, offset }` positions for both single and expanded mode.

### Requirements

- resolve DOM endpoints across mixed blocks
- snap appropriately at structural or delegated boundaries
- restore selection by logical offsets, not stale DOM nodes
- support range restoration after reconciliation

This is already required by the existing wave-05 errata and becomes more important in expanded mode.

## G. Gesture Policy

### Shift-click

Shift-click should produce a canonical text range first.

If the selected range is within expansion policy, the field editor expands around that range. If the range is too large, it falls back to `BlockSelection`.

Shift-click should not immediately force `BlockSelection` merely because the range contains mixed block roles.

### Drag

Final intended behavior:

- browser-native drag selection across an expanded host
- selection bridge resolves endpoints to canonical positions
- field editor expands and contracts around the resulting `TextSelection`

### Rectangle drag

For top-level block selection when no block is focused:

- an optional React-side region selector may own the pointer gesture
- intersected blocks resolve directly to canonical `BlockSelection`
- the field editor remains inactive during the gesture
- `Pen.Editor.SelectionRect` may render the live marquee rectangle, but it does not become a second semantic selection model

## H. Fallback Policy

The size policy is:

- ordinary expanded-range threshold: more than 50 blocks falls back to `BlockSelection`
- select-all / degenerate very large ranges: use the spec's special select-all path rather than attempting full expansion

This reconciles the practical expansion limit with the select-all behavior described in the main spec.

## H1. Escape Policy

`Escape` is a selection-state transition, not only a backend deactivation shortcut.

For the current focus target:

- if selection is a non-collapsed `TextSelection`, `Escape` collapses it to a caret at `focus`
- if selection is a collapsed caret, `Escape` converts it to single-block `BlockSelection` for the focused block and deactivates the field editor
- if selection is single-block `BlockSelection`, `Escape` clears selection entirely

This preserves the canonical selection model while giving the user a predictable ladder from text range to caret to block selection to no selection.

### Composition rule

During IME composition, app-level `Escape` handling must yield to native composition cancellation. The selection ladder does not run until composition has ended or been cancelled by the platform.

## I. Clipboard Policy

Clipboard uses canonical range semantics, not renderer-local heuristics.

For a cross-block `TextSelection`:

- serialize covered blocks in order
- preserve `application/x-pen-blocks`
- preserve `text/html`
- preserve `text/plain`
- use the same normalized range semantics for cut/delete and paste replacement

Clipboard is therefore downstream of range semantics, not an alternate selection model.

## Data Flow

### Single-block editing

1. User activates block.
2. `FieldEditorImpl` starts an editing session for that block.
3. Canonical selection is collapsed or same-block `TextSelection`.
4. Single-block backend handles input.
5. Core mutations update CRDT state.
6. Renderer reconciles from CRDT.

### Expanded cross-block editing

1. User expands selection across blocks.
2. Core stores canonical multi-block `TextSelection`.
3. `FieldEditorImpl` retains stable session ownership for the focus block.
4. Surface classifier yields `expanded` mode.
5. Expanded backend renders the shared mixed-block host.
6. Browser selection endpoints are resolved through the selection bridge.
7. `beforeinput` maps to normalized range operations in core.
8. Core writes to CRDT.
9. Expanded reconciler updates the DOM from CRDT.
10. Collapse returns surface to `single` while preserving session stability.

## Invariants

- `editor.selection` is canonical for document semantics.
- `DocumentRange` is the normalized primitive for range execution.
- `FieldEditorImpl.focusBlockId` is canonical for editing-session focus.
- `FieldEditorImpl.activeBlockIds` is derived surface membership.
- Expanded mode is a surface state layered on top of an active editing session.
- Backend attachment changes only when session target or surface backend class changes.
- Expansion and contraction must not occur mid-composition.
- Structural and delegated blocks can participate in expanded range selection without becoming directly editable in the outer host.

## Phased Rollout

## Phase 1: Core Range Semantics

Implement:

- `selectTextRange`
- multi-block `getSelectedText`
- multi-block `getSelectedBlocks`
- multi-block `replaceSelection`
- multi-block `deleteSelection`

This phase is required regardless of the final renderer architecture.

## Phase 2: Session / Surface Split

Refactor `FieldEditorImpl` so:

- session state is explicit and stable
- surface state is derived from selection plus session
- selection changes do not constantly rewrite session ownership

## Phase 3: Expanded Surface Contract

Introduce:

- expanded mode
- block role classifier
- shared expanded host abstraction

At this phase, mixed-role ranges are explicitly supported at the architecture level even if implementation remains partial.

## Phase 4: Expanded Backend

Implement the dedicated expanded `contenteditable` backend:

- mixed-block rendering
- DOM endpoint mapping
- range-aware `beforeinput`
- contract-on-collapse behavior

## Phase 5: Gesture Integration

Wire:

- shift-click
- drag expansion
- replacement typing
- delete/cut behavior

through canonical range semantics and expanded-surface lifecycle.

## Phase 6: Clipboard and Acceptance Hardening

Complete:

- cross-block copy/cut/paste round-tripping
- large-range fallback tests
- select-all special-path tests
- mixed-block range behavior tests

## Risks

### 1. Over-coupling session to selection

If selection changes directly rewrite editing-session ownership, backend churn, focus bugs, and IME regressions will follow.

Mitigation:

- keep `focusBlockId` session-owned
- derive only surface state from selection

### 2. Under-building expanded mode

If implementation hardcodes "mixed blocks force block selection", the system will diverge from the spec and the desired UX.

Mitigation:

- treat mixed block roles as a first-class architectural concept
- keep fallback primarily size-based

### 3. Trying to force expanded mode through single-block backends

This will produce a brittle abstraction and likely fail on native selection behavior.

Mitigation:

- make expanded mode a dedicated surface/backend path

## Open Questions

- Exact behavior for direct caret entry into a delegated code block inside an already-expanded range.
- Exact table-cell behavior when a multi-block text range intersects a table boundary.
- Whether select-all threshold should remain an explicit special case or be expressed through a generalized "degenerate expansion" policy.

These do not block the architectural direction in this RFC.

## Decision

Implement cross-block selection as a first-class canonical text-range feature with a stable field-editor session model and a real mixed-block expanded surface.

Do not treat mixed block presence as a reason to abandon expanded mode for ordinary cross-block selection.

Do treat large ranges and select-all as explicit fallback paths.
