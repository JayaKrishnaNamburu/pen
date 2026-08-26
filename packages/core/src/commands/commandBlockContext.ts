import type {
	BlockHandle,
	DiagnosticEvent,
	DocumentOp,
	Editor,
	FlowBlockCapability,
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
import type { AtomExtent } from "../selection/normalPosition";

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

export function isListBlock(block: BlockHandle | null): block is BlockHandle {
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

function getParentIdChildBlockIds(
	editor: Editor,
	parentBlockId: string,
): readonly string[] {
	return editor.documentState.blockOrder.filter(
		(blockId) => editor.documentState.parentOf(blockId) === parentBlockId,
	);
}

function getVisibleBlockIds(editor: Editor): readonly string[] {
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

/**
 * Ops that change one block's type in place, keeping its id and its text.
 *
 * A nested block's `parentId` is re-asserted after the type change, because
 * `set-props` replaces the prop set and would otherwise orphan the block out
 * of its parent.
 */
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
			type: "set-props",
			blockId: options.blockId,
			props: {
				type: options.newType,
				...(options.newProps ?? {}),
			},
		},
	];
	if (existingParentId) {
		ops.push({
			type: "set-props",
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
