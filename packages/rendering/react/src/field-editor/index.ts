export type {
	FieldEditorStore,
	FieldEditorStoreSnapshot,
} from "./store";
export {
	applyDeltaToDOM,
	fullReconcileToDOM,
	saveSelection,
	restoreSelection,
} from "./reconciler";
export { resolveMarksAtPosition } from "./markBoundary";
export {
	computeTextDiff,
	extractTextFromDOM,
	domSelectionToEditor,
	editorSelectionToDOM,
	getSelectionOffsets,
	getCaretOffset,
	type SelectionPoint,
	type TextDiffOp,
} from "./selectionBridge";
export {
	expandFieldEditorRange,
	contractFieldEditorRange,
	shouldUseBlockSelection,
	classifySelectionSurface,
	getExpandedBlockRole,
	type ExpandedBlockRole,
	type FieldEditorSurfaceMode,
	type FieldEditorSurfaceState,
} from "./crossBlock";
export {
	handlePaste,
	handleClipboardPaste,
	handleCopy,
	handleCut,
} from "./clipboard";
