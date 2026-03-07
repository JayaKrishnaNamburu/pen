// ── @pen/react — React rendering layer for Pen ─────────────
//
// Package entry. Re-exports all public API:
// - Pen.* compound component namespace
// - Individual primitives
// - Hooks
// - Contexts (for advanced use)
// - Field editor internals (for extension authors)
// - Renderer registry
// - Utilities

// ── Convenience component ───────────────────────────────────
export { PenEditor, type PenEditorProps } from "./penEditor.js";

// ── Compound component namespace ────────────────────────────
export { Pen } from "./primitives/index.js";

// ── Editor primitives ───────────────────────────────────────
export {
  EditorRoot,
  EditorContent,
  EditorBlock,
  InlineContent,
  EditorBlockHandle,
  EditorDragOverlay,
  EditorSelectionRect,
  EditorFieldEditor,
  type EditorRootProps,
  type EditorContentProps,
  type EditorBlockProps,
  type InlineContentProps,
  type BlockHandleProps,
  type DragOverlayProps,
  type SelectionRectProps,
  type FieldEditorWrapperProps,
} from "./primitives/editor/index.js";

// ── Toolbar primitives ──────────────────────────────────────
export {
  ToolbarRoot,
  ToolbarGroup,
  ToolbarButton,
  ToolbarToggle,
  ToolbarSelect,
  ToolbarSeparator,
  type ToolbarRootProps,
  type ToolbarGroupProps,
  type ToolbarButtonProps,
  type ToolbarToggleProps,
  type ToolbarSelectProps,
} from "./primitives/toolbar/index.js";

// ── Slash menu primitives ───────────────────────────────────
export {
  SlashMenuRoot,
  SlashMenuInput,
  SlashMenuList,
  SlashMenuGroup,
  SlashMenuItem,
  SlashMenuEmpty,
  type SlashMenuRootProps,
  type SlashMenuInputProps,
  type SlashMenuListProps,
  type SlashMenuGroupProps,
  type SlashMenuItemProps,
  type SlashMenuEmptyProps,
} from "./primitives/slash-menu/index.js";

// ── Hooks ───────────────────────────────────────────────────
export {
  useEditor,
  useFieldEditor,
  useSelection,
  useDecorations,
  useExtensionState,
  useToolbar,
  useSlashMenu,
  useBlockList,
  useVisualViewport,
  type SlashMenuState,
  type SlashMenuActions,
  type VisualViewportState,
} from "./hooks/index.js";

// ── Contexts (for advanced composition) ─────────────────────
export {
  EditorContext,
  useEditorContext,
  FieldEditorContext,
  useFieldEditorContext,
  ToolbarContext,
  useToolbarContext,
  EMPTY_TOOLBAR_STATE,
  type EditorContextValue,
  type PasteImporters,
  type ToolbarState,
  type ToolbarContextValue,
} from "./context/index.js";

// ── Renderer registry ───────────────────────────────────────
export {
  resolveRenderer,
  registerRenderer,
  ParagraphRenderer,
  HeadingRenderer,
  BulletListItemRenderer,
  NumberedListItemRenderer,
  CheckListItemRenderer,
  CodeBlockRenderer,
  ImageRenderer,
  TableRenderer,
  DividerRenderer,
  CalloutRenderer,
  ToggleRenderer,
  BlockquoteRenderer,
  DefaultRenderer,
} from "./renderers/index.js";

// ── Field editor internals (for extension authors) ──────────
export { FieldEditorImpl } from "./field-editor/fieldEditorImpl.js";
export {
  applyDeltaToDOM,
  fullReconcileToDOM,
  saveSelection,
  restoreSelection,
} from "./field-editor/reconciler.js";
export { resolveMarksAtPosition } from "./field-editor/markBoundary.js";
export {
  computeTextDiff,
  extractTextFromDOM,
  type TextDiffOp,
  type SelectionPoint,
} from "./field-editor/selectionBridge.js";
export { handlePaste, handleCopy, handleCut } from "./field-editor/clipboard.js";

// ── Utilities ───────────────────────────────────────────────
export { composeRefs } from "./utils/composeRefs.js";
export { renderAsChild, type AsChildProps } from "./utils/asChild.js";
export { DATA_ATTRS, buildDataAttributes } from "./utils/dataAttributes.js";

// ── Re-export key types from @pen/core for convenience ──────
export type {
  BlockRenderContext,
  BlockRenderer,
  BlockHandle,
  Editor,
  SelectionState,
  DecorationSet,
  Decoration,
  InlineDecoration,
  BlockDecoration,
  FieldEditor,
  InputBackend,
} from "@pen/core";

export type { CreateEditorOptions } from "@pen/core";
