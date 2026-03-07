export { FieldEditorImpl } from "./fieldEditorImpl.js";
export type {
	FieldEditorStore,
	FieldEditorStoreSnapshot,
} from "./store.js";
export { EditContextBackend } from "./editContextBackend.js";
export { ContentEditableBackend } from "./contenteditableBackend.js";
export { ExpandedContentEditableBackend } from "./expandedContentEditableBackend.js";
export {
	applyDeltaToDOM,
	fullReconcileToDOM,
	saveSelection,
	restoreSelection,
} from "./reconciler.js";
export { resolveMarksAtPosition } from "./markBoundary.js";
export {
	computeTextDiff,
	extractTextFromDOM,
	domSelectionToEditor,
	editorSelectionToDOM,
	getSelectionOffsets,
	getCaretOffset,
	type SelectionPoint,
	type TextDiffOp,
} from "./selectionBridge.js";
export {
	expandFieldEditorRange,
	contractFieldEditorRange,
	shouldUseBlockSelection,
	classifySelectionSurface,
	getExpandedBlockRole,
	type ExpandedBlockRole,
	type FieldEditorSurfaceMode,
	type FieldEditorSurfaceState,
} from "./crossBlock.js";
export { handlePaste, handleCopy, handleCut } from "./clipboard.js";
