import type { EditorInternals, CreateEditorOptions, PenEventMap, DocumentCommitEvent, CRDTAdapter, CRDTDocument, CRDTEvent, PenDocument, SchemaRegistry, Awareness, DocumentSession, DocumentScope, DocumentScopeReplacementEvent, DocumentProfile, Extension, DocumentOp, ApplyOptions, OpOrigin, MutationGroupMetadata, SelectionState, TextSelection, DocumentRange, BlockHandle, Block, DocumentState, UndoManager, Unsubscribe, CRDTMap, CRDTArray, Position, DecorationSet, EditorViewMode } from "@pen/types";
import { AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY, COLLECT_KEY_BINDINGS_SLOT_KEY, usesInlineTextSelection, createMutationGroupMetadata, getApplyOptionsGroupId, MUTATION_GROUP_METADATA_KEY, UNDO_HISTORY_METADATA_CONTROLLER_SLOT_KEY } from "@pen/types";
import { undoExtension } from "@pen/undo";
import { documentOpsExtension } from "@pen/document-ops";
import { deltaStreamExtension } from "@pen/delta-stream";
import { richTextShortcutsExtension } from "@pen/shortcuts";
import { SchemaEngineImpl } from "../schema/normalize";
import { createBlockHandle } from "../schema/handles";
import { resolveCellSelectionMatrix } from "./cellSelection";
import { filterOpsForDocumentProfile } from "./profilePolicy";
import type { CRDTUnknownMap } from "./crdtShapes";
import { getTextProp, getTableContent, getCellText as getCellTextFromRow, isCRDTMap } from "./crdtShapes";
import { DocumentStateImpl } from "./documentState";
import { createDocumentSession } from "./documentSession";

type EditorImplRuntime = any;
type CRDTBlockMap = CRDTMap<CRDTMap<unknown>>;
type RawPenDocumentLike = { getArray?(name: "blockOrder"): CRDTArray<string>; getMap?(name: "blocks" | "apps" | "metadata"): CRDTMap<unknown>; blockOrder?: CRDTArray<string>; blocks?: CRDTMap<unknown>; apps?: CRDTMap<unknown>; metadata?: CRDTMap<unknown>; };
function createGeneratedBlockId(): string { return crypto.randomUUID(); }
function missingPenDocumentRoot(name: string): never { throw new Error(`CRDT document is missing required Pen root "${name}".`); }
let hasWarnedAboutWithoutOption = false;
const NOOP_UNDO: UndoManager = { undo: () => false, redo: () => false, canUndo: () => false, canRedo: () => false, stopCapturing: () => {}, syncExplicitUndoGroup: () => {}, setGroupTimeout: () => {}, registerTrackedOrigins: () => () => {}, onStackChange: () => () => {} };


export function replaceEditorSelection(editor: EditorImplRuntime, content: string | Block[]): void {
	const self = editor as EditorImplRuntime;
const sel = self._selection.getSelection();
if (!sel) return;

if (sel.type === "text") {
	const range = self._getSelectionRange(sel);
	if (range.isMultiBlock) {
		if (typeof content === "string") {
			self._replaceMultiBlockTextRange(range, content);
		}
		return;
	}

	const from = range.start.offset;
	const to = range.end.offset;
	const ops: DocumentOp[] = [];
	if (to > from) {
		ops.push({
			type: "delete-text",
			blockId: range.start.blockId,
			offset: from,
			length: to - from,
		});
	}
	if (typeof content === "string" && content.length > 0) {
		ops.push({
			type: "insert-text",
			blockId: range.start.blockId,
			offset: from,
			text: content,
		});
	}
	if (ops.length > 0) {
		self.apply(ops);
	}
	const nextOffset =
		typeof content === "string" ? from + content.length : from;
	self._collapseToPoint({
		blockId: range.start.blockId,
		offset: nextOffset,
	});
	return;
}

if (sel.type === "block" && sel.blockIds.length > 0) {
	const firstId = sel.blockIds[0];
	const firstIndex = self._pipeline._resolvePosition({
		before: firstId,
	});
	const ops: DocumentOp[] = [];

	for (const id of sel.blockIds) {
		ops.push({ type: "delete-block", blockId: id });
	}

	const insertPosition: Position =
		firstIndex === 0
			? "first"
			: {
					after: (
						self._doc.blockOrder as CRDTArray<string>
					).get(firstIndex - 1) as string,
				};

	if (typeof content === "string") {
		const newId = createGeneratedBlockId();
		ops.push({
			type: "insert-block",
			blockId: newId,
			blockType: "paragraph",
			props: {},
			position: insertPosition,
		});
		if (content.length > 0) {
			ops.push({
				type: "insert-text",
				blockId: newId,
				offset: 0,
				text: content,
			});
		}
	} else if (Array.isArray(content)) {
		let prevPosition = insertPosition;
		for (const block of content) {
			const newId = createGeneratedBlockId();
			ops.push({
				type: "insert-block",
				blockId: newId,
				blockType: block.type,
				props: block.props ?? {},
				position: prevPosition,
			});
			if (
				typeof block.content === "string" &&
				block.content.length > 0
			) {
				ops.push({
					type: "insert-text",
					blockId: newId,
					offset: 0,
					text: block.content,
				});
			}
			prevPosition = { after: newId };
		}
	}

	self.apply(ops);
}
}

export function deleteEditorSelection(editor: EditorImplRuntime, options?: ApplyOptions): void {
	const self = editor as EditorImplRuntime;
const sel = self._selection.getSelection();
if (!sel) return;

if (sel.type === "text") {
	const range = self._getSelectionRange(sel);
	if (range.isMultiBlock) {
		self._deleteMultiBlockTextRange(range, options);
		return;
	}

	if (
		!self._usesInlineTextSelection(range.start.blockId) &&
		self._isWholeBlockSelection(
			range.start.blockId,
			range.start.offset,
			range.end.offset,
		)
	) {
		self.apply(
			[
				{
					type: "delete-block",
					blockId: range.start.blockId,
				},
			],
			options,
		);
		self.setSelection(null);
		return;
	}

	const from = range.start.offset;
	const to = range.end.offset;
	if (to > from) {
		self.apply(
			[
				{
					type: "delete-text",
					blockId: range.start.blockId,
					offset: from,
					length: to - from,
				},
			],
			options,
		);
	}
	self._collapseToPoint({
		blockId: range.start.blockId,
		offset: from,
	});
	return;
}

if (sel.type === "block") {
	const ops: DocumentOp[] = sel.blockIds.map((id: string) => ({
		type: "delete-block" as const,
		blockId: id,
	}));
	self.apply(ops, options);
	self.setSelection(null);
}

if (sel.type === "cell") {
	const block = self.getBlock(sel.blockId);
	if (!block) return;
	const ops: DocumentOp[] = [];
	for (const rowCells of resolveCellSelectionMatrix(block, sel)) {
		for (const cellCoord of rowCells) {
			const cell = block.tableCell(cellCoord.row, cellCoord.col);
			if (!cell) continue;
			const len = cell.length();
			if (len > 0) {
				ops.push({
					type: "delete-table-cell-text",
					blockId: sel.blockId,
					row: cellCoord.row,
					col: cellCoord.col,
					offset: 0,
					length: len,
				} as DocumentOp);
			}
		}
	}
	if (ops.length > 0) {
		self.apply(ops, options);
	}
	self.setSelection({
		...sel,
		head: sel.anchor,
	});
}
}

export function getTextForBlock(editor: EditorImplRuntime, blockId: string): string {
	const self = editor as EditorImplRuntime;
return self.getBlock(blockId)?.textContent() ?? "";
}

export function getSelectionRange(editor: EditorImplRuntime, sel: TextSelection): DocumentRange {
	const self = editor as EditorImplRuntime;
return sel.toRange();
}

export function usesInlineTextSelectionForBlock(editor: EditorImplRuntime, blockId: string): boolean {
	const self = editor as EditorImplRuntime;
const block = self.getBlock(blockId);
if (!block) {
	return false;
}

const schema = self._registry.resolve(block.type);
if (!schema) {
	return false;
}

return usesInlineTextSelection(schema);
}

export function getBlockSelectionSpan(editor: EditorImplRuntime, blockId: string): number {
	const self = editor as EditorImplRuntime;
if (self._usesInlineTextSelection(blockId)) {
	return self._getTextForBlock(blockId).length;
}
return self.getBlock(blockId) ? 1 : 0;
}

export function isWholeBlockSelection(editor: EditorImplRuntime, 
	blockId: string,
	startOffset: number,
	endOffset: number,
): boolean {
	const self = editor as EditorImplRuntime;
const span = self._getBlockSelectionSpan(blockId);
if (span <= 0) {
	return false;
}
return startOffset <= 0 && endOffset >= span;
}

export function collapseToPoint(editor: EditorImplRuntime, point: { blockId: string; offset: number }): void {
	const self = editor as EditorImplRuntime;
	self.selectTextRange(point, point);
}

export function sliceInlineDeltas(
	editor: EditorImplRuntime,
	blockId: string,
	startOffset: number,
): Array<{ insert: string; attributes?: Record<string, unknown> }> {
	const self = editor as EditorImplRuntime;
	const handle = self.getBlock(blockId);
	if (!handle) return [];
	const deltas = handle.textDeltas().filter((delta: { insert: string }) => delta.insert !== "\u200B");
	const sliced: Array<{ insert: string; attributes?: Record<string, unknown> }> = [];
	let offset = 0;
	for (const delta of deltas) {
		const length = delta.insert.length;
		if (startOffset >= offset + length) {
			offset += length;
			continue;
		}
		const localStart = Math.max(0, startOffset - offset);
		const text = delta.insert.slice(localStart);
		if (text.length > 0) {
			sliced.push({ insert: text, ...(delta.attributes ? { attributes: delta.attributes } : {}) });
		}
		offset += length;
	}
	return sliced;
}

export function buildMultiBlockTextReplacement(
	editor: EditorImplRuntime,
	range: DocumentRange,
	insertedText: string,
): { ops: DocumentOp[]; caret: { blockId: string; offset: number } } {
	const self = editor as EditorImplRuntime;
	const startId = range.start.blockId;
	const endId = range.end.blockId;
	const startText = self._getTextForBlock(startId);
	const middleIds = range.blockRange.slice(1, -1);
	const suffixDeltas = self._sliceInlineDeltas(endId, range.end.offset);
	const ops: DocumentOp[] = [];
	if (range.start.offset < startText.length) {
		ops.push({ type: "delete-text", blockId: startId, offset: range.start.offset, length: startText.length - range.start.offset });
	}
	if (range.end.offset > 0) {
		ops.push({ type: "delete-text", blockId: endId, offset: 0, length: range.end.offset });
	}
	for (const blockId of middleIds) ops.push({ type: "delete-block", blockId });
	let insertionOffset = range.start.offset;
	if (insertedText.length > 0) {
		ops.push({ type: "insert-text", blockId: startId, offset: insertionOffset, text: insertedText });
		insertionOffset += insertedText.length;
	}
	for (const delta of suffixDeltas) {
		ops.push({ type: "insert-text", blockId: startId, offset: insertionOffset, text: delta.insert, marks: delta.attributes });
		insertionOffset += delta.insert.length;
	}
	ops.push({ type: "delete-block", blockId: endId });
	return { ops, caret: { blockId: startId, offset: range.start.offset + insertedText.length } };
}

export function deleteMultiBlockTextRange(
	editor: EditorImplRuntime,
	range: DocumentRange,
	options?: ApplyOptions,
): { blockId: string; offset: number } | null {
	const self = editor as EditorImplRuntime;
	const startId = range.start.blockId;
	const endId = range.end.blockId;
	if (startId === endId) {
		const from = range.start.offset;
		const to = range.end.offset;
		if (to > from) self.apply([{ type: "delete-text", blockId: startId, offset: from, length: to - from }], options);
		const caret = { blockId: startId, offset: from };
		self._collapseToPoint(caret);
		return caret;
	}
	const startInline = self._usesInlineTextSelection(startId);
	const endInline = self._usesInlineTextSelection(endId);
	if (startInline && endInline) {
		const { ops, caret } = self._buildMultiBlockTextReplacement(range, "");
		self.apply(ops, options);
		self._collapseToPoint(caret);
		return caret;
	}
	const middleIds = range.blockRange.slice(1, -1);
	const ops: DocumentOp[] = [];
	if (startInline) {
		const startText = self._getTextForBlock(startId);
		if (range.start.offset < startText.length) ops.push({ type: "delete-text", blockId: startId, offset: range.start.offset, length: startText.length - range.start.offset });
	} else if (self._isWholeBlockSelection(startId, range.start.offset, self._getBlockSelectionSpan(startId))) {
		ops.push({ type: "delete-block", blockId: startId });
	}
	for (const blockId of middleIds) ops.push({ type: "delete-block", blockId });
	if (endInline) {
		if (range.end.offset > 0) ops.push({ type: "delete-text", blockId: endId, offset: 0, length: range.end.offset });
	} else if (self._isWholeBlockSelection(endId, 0, range.end.offset)) {
		ops.push({ type: "delete-block", blockId: endId });
	}
	if (ops.length > 0) self.apply(ops, options);
	const caret = startInline ? { blockId: startId, offset: range.start.offset } : endInline ? { blockId: endId, offset: 0 } : null;
	if (caret) self._collapseToPoint(caret);
	else self.setSelection(null);
	return caret;
}

export function replaceMultiBlockTextRange(
	editor: EditorImplRuntime,
	range: DocumentRange,
	text: string,
): { blockId: string; offset: number } {
	const self = editor as EditorImplRuntime;
	const { ops, caret } = self._buildMultiBlockTextReplacement(range, text);
	self.apply(ops);
	self._collapseToPoint(caret);
	return caret;
}
