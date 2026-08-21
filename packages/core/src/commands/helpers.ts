import type {
	BlockHandle,
	DiagnosticEvent,
	DocumentOp,
	Editor,
	FlowBlockCapability,
	SelectionState,
	TextSelection,
} from "@input/pen-types";

import {
	getFlowCapabilityFromSchema,
	getFlowCapabilityFromType,
	isContinuousTextFlowCapability,
} from "../editor/profilePolicy";
import { localeFacet } from "../facets/i18nFacets";
import {
	resolveFieldEditorInputMode,
	usesInlineTextSelection,
} from "../schema/fieldEditorCapabilities";
import type {
	AtomExtent,
	NormalPositionBlock,
	NormalPositionSnapshot,
} from "../selection/normalPosition";
import type {
	TransitionBlock,
	TransitionContainerKind,
	TransitionSnapshot,
	SelectionState as TransitionSelection,
} from "../selection/transitions";

export const LIST_BLOCK_TYPES = new Set([
	"bulletListItem",
	"numberedListItem",
	"checkListItem",
]);

export const HEADING_TYPES = new Set(["heading"]);

export const CONTAINER_EXIT_TYPES = new Set(["blockquote", "callout"]);

export const BACKSPACE_EXIT_TYPES = new Set([
	...LIST_BLOCK_TYPES,
	...CONTAINER_EXIT_TYPES,
	...HEADING_TYPES,
]);

export const PARENT_ID_CONTAINER_TYPES = new Set([
	"toggle",
	"callout",
	"blockquote",
]);

export type DeleteDirection = "backward" | "forward";

export type Point = { blockId: string; offset: number };

export function emitCommandDiagnostic(
	editor: Editor,
	event: DiagnosticEvent,
): void {
	editor.internals?.emit("diagnostic", event);
}

export function getEditorLocale(editor: Editor): string {
	try {
		const locale = editor.facet(localeFacet);
		return typeof locale === "string" && locale.length > 0 ? locale : "en";
	} catch {
		return "en";
	}
}

export function getEditorFlowCapability(
	editor: Editor,
	blockId: string,
): FlowBlockCapability | null {
	const block = editor.getBlock(blockId);
	if (!block) {
		return null;
	}
	return (
		getFlowCapabilityFromSchema(editor.schema.resolve(block.type)) ??
		getFlowCapabilityFromType(block.type)
	);
}

export function isEditableTextBlock(editor: Editor, blockId: string): boolean {
	return isContinuousTextFlowCapability(
		getEditorFlowCapability(editor, blockId),
	);
}

export function getBlockInputMode(
	editor: Editor,
	blockId: string,
): "richtext" | "code" | "table" | "none" {
	const block = editor.getBlock(blockId);
	if (!block) {
		return "none";
	}
	return resolveFieldEditorInputMode(editor.schema.resolve(block.type));
}

export function usesInlineMarks(editor: Editor, blockId: string): boolean {
	const block = editor.getBlock(blockId);
	if (!block) {
		return false;
	}
	const schema = editor.schema.resolve(block.type);
	return usesInlineTextSelection(schema) && schema?.fieldEditor !== "code";
}

export function isListBlock(
	block: BlockHandle | null,
): block is BlockHandle {
	return !!block && LIST_BLOCK_TYPES.has(block.type);
}

export function getListIndent(block: BlockHandle): number {
	const rawIndent = block.props?.indent;
	return typeof rawIndent === "number" && rawIndent >= 0 ? rawIndent : 0;
}

export function isInsideParentIdContainer(
	editor: Editor,
	blockId: string,
): boolean {
	const parentId = editor.documentState.parentOf(blockId);
	if (!parentId) {
		return false;
	}
	const parent = editor.getBlock(parentId);
	return !!parent && PARENT_ID_CONTAINER_TYPES.has(parent.type);
}

export function getRootBlockIds(editor: Editor): readonly string[] {
	return editor.documentState.blockOrder.filter(
		(blockId) => editor.documentState.parentOf(blockId) == null,
	);
}

export function getParentIdChildBlockIds(
	editor: Editor,
	parentBlockId: string,
): readonly string[] {
	return editor.documentState.blockOrder.filter(
		(blockId) => editor.documentState.parentOf(blockId) === parentBlockId,
	);
}

export function getVisibleBlockIds(editor: Editor): readonly string[] {
	const visibleBlockIds: string[] = [];
	for (const rootBlockId of getRootBlockIds(editor)) {
		collectVisibleBlockIds(editor, rootBlockId, visibleBlockIds);
	}
	return visibleBlockIds;
}

export function getAdjacentVisibleBlockId(
	editor: Editor,
	blockId: string,
	direction: "previous" | "next",
): string | null {
	const visibleBlockIds = getVisibleBlockIds(editor);
	const blockIndex = visibleBlockIds.indexOf(blockId);
	if (blockIndex < 0) {
		return null;
	}
	const adjacentIndex =
		direction === "previous" ? blockIndex - 1 : blockIndex + 1;
	return visibleBlockIds[adjacentIndex] ?? null;
}

export function getAdjacentEditableBlock(
	editor: Editor,
	blockId: string,
	direction: "previous" | "next",
): BlockHandle | null {
	let adjacentBlockId = getAdjacentVisibleBlockId(editor, blockId, direction);
	while (adjacentBlockId) {
		const adjacentBlock = editor.getBlock(adjacentBlockId);
		if (adjacentBlock && isEditableTextBlock(editor, adjacentBlock.id)) {
			return adjacentBlock;
		}
		adjacentBlockId = getAdjacentVisibleBlockId(
			editor,
			adjacentBlockId,
			direction,
		);
	}
	return null;
}

export function logicalInline(block: BlockHandle): {
	text: string;
	atoms: AtomExtent[];
} {
	if (block.length() === 0) {
		return { text: "", atoms: [] };
	}

	const atoms: AtomExtent[] = [];
	let text = "";
	for (const delta of block.inlineDeltas()) {
		if (typeof delta.insert === "string") {
			text += delta.insert;
			continue;
		}
		if (delta.insert) {
			const start = text.length;
			text += "\uFFFC";
			atoms.push({ start, end: start + 1 });
		}
	}
	return { text, atoms };
}

export function getInlineNodeRange(
	editor: Editor,
	options: { blockId: string; offset: number; direction: DeleteDirection },
): { start: number; end: number } | null {
	const block = editor.getBlock(options.blockId);
	if (!block) {
		return null;
	}

	let currentOffset = 0;
	for (const delta of block.inlineDeltas()) {
		const length =
			typeof delta.insert === "string" ? delta.insert.length : 1;
		const nextOffset = currentOffset + length;
		const isInlineNode = typeof delta.insert !== "string";

		if (
			isInlineNode &&
			options.direction === "backward" &&
			options.offset === nextOffset
		) {
			return { start: currentOffset, end: nextOffset };
		}
		if (
			isInlineNode &&
			options.direction === "forward" &&
			options.offset === currentOffset
		) {
			return { start: currentOffset, end: nextOffset };
		}
		currentOffset = nextOffset;
	}
	return null;
}

export function getAtomRangeAtOffset(
	block: BlockHandle,
	offset: number,
): { start: number; end: number } | null {
	for (const atom of logicalInline(block).atoms) {
		if (offset >= atom.start && offset < atom.end) {
			return atom;
		}
		if (offset === atom.end) {
			return atom;
		}
	}
	return null;
}

export function marksAtOffset(
	block: BlockHandle,
	offset: number,
): Record<string, unknown> | undefined {
	let current = 0;
	let inherited: Record<string, unknown> | undefined;
	for (const delta of block.textDeltas()) {
		const length = delta.insert.length;
		const start = current;
		const end = current + length;
		current = end;
		if (offset > start && offset <= end && delta.attributes) {
			return { ...delta.attributes };
		}
		if (offset === start && delta.attributes) {
			inherited = { ...delta.attributes };
		}
	}
	return inherited;
}

export function documentOrderedTextPoints(
	editor: Editor,
	selection: TextSelection,
): { start: Point; end: Point } | null {
	const order = editor.documentState.blockOrder;
	const anchorIndex = order.indexOf(selection.anchor.blockId);
	const focusIndex = order.indexOf(selection.focus.blockId);
	if (anchorIndex < 0 || focusIndex < 0) {
		return null;
	}
	if (
		anchorIndex < focusIndex ||
		(anchorIndex === focusIndex &&
			selection.anchor.offset <= selection.focus.offset)
	) {
		return { start: selection.anchor, end: selection.focus };
	}
	return { start: selection.focus, end: selection.anchor };
}

export function textSelectionResult(
	anchor: Point,
	focus: Point = anchor,
): SelectionState {
	const collapsed =
		anchor.blockId === focus.blockId && anchor.offset === focus.offset;
	return {
		type: "text",
		anchor,
		focus,
		isCollapsed: collapsed,
		isMultiBlock: anchor.blockId !== focus.blockId,
		blockRange: [anchor.blockId],
		toRange: () => {
			throw new Error("command text selection is a write payload");
		},
	};
}

export function blockSelectionResult(
	blockIds: readonly string[],
): SelectionState {
	return {
		type: "block",
		blockIds: [...blockIds],
	};
}

export function collapsedAt(blockId: string, offset: number): SelectionState {
	return textSelectionResult({ blockId, offset });
}

export function readTextFocus(editor: Editor): Point | null {
	const selection = editor.selection;
	if (!selection || selection.type !== "text") {
		return null;
	}
	return selection.focus;
}

export function readTextAnchor(editor: Editor): Point | null {
	const selection = editor.selection;
	if (!selection || selection.type !== "text") {
		return null;
	}
	return selection.anchor;
}

export function buildNormalPositionSnapshot(
	editor: Editor,
): NormalPositionSnapshot {
	const blockOrder = [...editor.documentState.blockOrder];
	const blocks: Record<string, NormalPositionBlock> = {};
	for (const blockId of blockOrder) {
		const block = editor.getBlock(blockId);
		if (!block) {
			continue;
		}
		if (!isEditableTextBlock(editor, blockId)) {
			blocks[blockId] = { kind: "structural", text: "" };
			continue;
		}
		const logical = logicalInline(block);
		blocks[blockId] = {
			kind: "text",
			text: logical.text,
			atoms: logical.atoms,
		};
	}
	return { blockOrder, blocks };
}

export function buildTransitionSnapshot(editor: Editor): TransitionSnapshot {
	const blockOrder = [...editor.documentState.blockOrder];
	const blocks: Record<string, TransitionBlock> = {};
	for (const blockId of blockOrder) {
		const block = editor.getBlock(blockId);
		if (!block) {
			continue;
		}
		const parentId = editor.documentState.parentOf(blockId);
		const listContainer = listContainerFor(editor, block);
		blocks[blockId] = {
			id: blockId,
			kind: isEditableTextBlock(editor, blockId) ? "text" : "structural",
			length: block.length(),
			parentId,
			containerId: listContainer?.id ?? parentId,
			containerKind: listContainer?.kind ?? parentContainerKind(editor, parentId),
		};
	}
	return {
		blockOrder,
		topLevelIds: getRootBlockIds(editor),
		blocks,
	};
}

export function toTransitionSelection(
	editor: Editor,
): TransitionSelection {
	const selection = editor.selection;
	if (!selection) {
		return null;
	}
	switch (selection.type) {
		case "text":
			return {
				type: "text",
				anchor: selection.anchor,
				focus: selection.focus,
				affinity: "downstream",
				goalX: null,
			};
		case "block":
			return {
				type: "block",
				blockIds: selection.blockIds,
				head:
					selection.blockIds[selection.blockIds.length - 1] ??
					selection.blockIds[0] ??
					"",
			};
		case "cell":
			return {
				type: "cell",
				blockId: selection.blockId,
				anchor: selection.anchor,
				head: selection.head,
			};
		case "app":
			return { type: "app", appId: selection.appId };
		default: {
			const _exhaustive: never = selection;
			return _exhaustive;
		}
	}
}

export function fromTransitionSelection(
	selection: TransitionSelection,
): SelectionState | null {
	if (!selection) {
		return null;
	}
	switch (selection.type) {
		case "text":
			return textSelectionResult(selection.anchor, selection.focus);
		case "block":
			return blockSelectionResult(selection.blockIds);
		case "cell":
			return {
				type: "cell",
				blockId: selection.blockId,
				anchor: selection.anchor,
				head: selection.head,
			};
		case "app":
			return { type: "app", appId: selection.appId };
		default: {
			const _exhaustive: never = selection;
			return _exhaustive;
		}
	}
}

export function replaceRangeOps(
	editor: Editor,
	selection: TextSelection,
	text: string,
	marks?: Record<string, unknown | null>,
): { ops: DocumentOp[]; caret: Point } | null {
	const range = documentOrderedTextPoints(editor, selection);
	if (!range) {
		return null;
	}
	if (range.start.blockId === range.end.blockId) {
		return replaceSingleBlockRange(
			range.start.blockId,
			range.start.offset,
			range.end.offset,
			text,
			marks,
		);
	}
	return replaceMultiBlockRange(editor, range.start, range.end, text, marks);
}

function replaceSingleBlockRange(
	blockId: string,
	start: number,
	end: number,
	text: string,
	marks?: Record<string, unknown | null>,
): { ops: DocumentOp[]; caret: Point } {
	const ops: DocumentOp[] = [];
	if (end > start) {
		ops.push({
			type: "delete-text",
			blockId,
			offset: start,
			length: end - start,
		});
	}
	if (text.length > 0) {
		ops.push({
			type: "insert-text",
			blockId,
			offset: start,
			text,
			...(marks ? { marks } : {}),
		});
	}
	return {
		ops,
		caret: { blockId, offset: start + text.length },
	};
}

function replaceMultiBlockRange(
	editor: Editor,
	start: Point,
	end: Point,
	text: string,
	marks?: Record<string, unknown | null>,
): { ops: DocumentOp[]; caret: Point } | null {
	const order = editor.documentState.blockOrder;
	const startIndex = order.indexOf(start.blockId);
	const endIndex = order.indexOf(end.blockId);
	if (startIndex < 0 || endIndex < 0 || startIndex >= endIndex) {
		return null;
	}

	const startBlock = editor.getBlock(start.blockId);
	const endBlock = editor.getBlock(end.blockId);
	if (!startBlock || !endBlock) {
		return null;
	}

	const ops: DocumentOp[] = [];
	const startLength = startBlock.length();
	if (start.offset < startLength) {
		ops.push({
			type: "delete-text",
			blockId: start.blockId,
			offset: start.offset,
			length: startLength - start.offset,
		});
	}
	if (end.offset > 0) {
		ops.push({
			type: "delete-text",
			blockId: end.blockId,
			offset: 0,
			length: end.offset,
		});
	}
	for (const blockId of order.slice(startIndex + 1, endIndex)) {
		ops.push({ type: "delete-block", blockId });
	}
	ops.push({
		type: "merge-blocks",
		targetBlockId: start.blockId,
		sourceBlockId: end.blockId,
	});
	if (text.length > 0) {
		ops.push({
			type: "insert-text",
			blockId: start.blockId,
			offset: start.offset,
			text,
			...(marks ? { marks } : {}),
		});
	}
	return {
		ops,
		caret: { blockId: start.blockId, offset: start.offset + text.length },
	};
}

export function convertBlockOps(
	editor: Editor,
	options: {
		blockId: string;
		newType: string;
		newProps?: Record<string, unknown>;
	},
): DocumentOp[] {
	const existingParentId = editor.documentState.parentOf(options.blockId);
	const ops: DocumentOp[] = [
		{
			type: "convert-block",
			blockId: options.blockId,
			newType: options.newType,
			newProps: options.newProps,
		},
	];
	if (existingParentId) {
		ops.push({
			type: "update-block",
			blockId: options.blockId,
			props: { parentId: existingParentId },
		});
	}
	return ops;
}

function collectVisibleBlockIds(
	editor: Editor,
	blockId: string,
	visibleBlockIds: string[],
): void {
	visibleBlockIds.push(blockId);
	if (!shouldShowParentIdChildren(editor, blockId)) {
		return;
	}
	for (const childBlockId of getParentIdChildBlockIds(editor, blockId)) {
		collectVisibleBlockIds(editor, childBlockId, visibleBlockIds);
	}
}

function shouldShowParentIdChildren(editor: Editor, blockId: string): boolean {
	const block = editor.getBlock(blockId);
	if (!block || !PARENT_ID_CONTAINER_TYPES.has(block.type)) {
		return false;
	}
	if (block.type !== "toggle") {
		return true;
	}
	return Boolean(block.props?.open);
}

function listContainerFor(
	editor: Editor,
	block: BlockHandle,
): { id: string; kind: TransitionContainerKind } | null {
	if (!LIST_BLOCK_TYPES.has(block.type)) {
		return null;
	}
	const parentId = editor.documentState.parentOf(block.id) ?? "root";
	return {
		id: `list:${parentId}:${block.type}`,
		kind: "list",
	};
}

function parentContainerKind(
	editor: Editor,
	parentId: string | null,
): TransitionContainerKind | null {
	if (!parentId) {
		return null;
	}
	const parent = editor.getBlock(parentId);
	if (!parent) {
		return null;
	}
	if (PARENT_ID_CONTAINER_TYPES.has(parent.type)) {
		return "layout-cell";
	}
	if (parent.type === "table") {
		return "table";
	}
	return null;
}
