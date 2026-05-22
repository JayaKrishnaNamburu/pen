import type {
	ApplyOptions,
	DocumentOp,
	Editor,
	FieldEditor,
	InlineDelta,
	InlineNodeDeltaInsert,
} from "@pen/types";
import { FIELD_EDITOR_SLOT_KEY } from "@pen/types";
import {
	pointToEditorSelectionPoint,
	type SelectionPoint,
} from "./selectionBridge";

export const INLINE_ATOM_LOGICAL_LENGTH = 1;

const ZERO_WIDTH_SPACE = "\u200B";
const OBJECT_REPLACEMENT_CHARACTER = "\uFFFC";
const DEFAULT_APPLY_OPTIONS: ApplyOptions = { origin: "user", undoGroup: true };

export interface InlineAtomSource {
	editor: Editor;
	blockId: string;
	offset: number;
}

export interface InlineAtomDropTarget {
	editor: Editor;
	blockId: string;
	offset: number;
}

export interface InlineAtomSnapshot {
	blockId: string;
	offset: number;
	type: string;
	props: Record<string, unknown>;
	text: string;
}

export interface ResolveInlineAtomDropTargetOptions {
	editor: Editor;
	root: HTMLElement | null;
	clientX: number;
	clientY: number;
}

export interface MoveInlineAtomOptions {
	source: InlineAtomSource;
	target: InlineAtomDropTarget;
	apply?: ApplyOptions;
}

export interface ReplaceInlineAtomWithTextOptions {
	source: InlineAtomSource;
	text: string;
	selection?: "all" | "end" | "none";
	apply?: ApplyOptions;
}

export function getInlineAtomAtOffset(
	editor: Editor,
	source: Pick<InlineAtomSource, "blockId" | "offset">,
): InlineAtomSnapshot | null {
	const block = editor.getBlock(source.blockId);
	if (!block) {
		return null;
	}

	let offset = 0;
	for (const delta of block.inlineDeltas()) {
		const length = getInlineDeltaLength(delta);
		if (offset === source.offset && typeof delta.insert !== "string") {
			return {
				blockId: source.blockId,
				offset: source.offset,
				type: delta.insert.type,
				props: { ...delta.insert.props },
				text: getInlineAtomText(editor, delta.insert),
			};
		}

		offset += length;
	}

	return null;
}

export function resolveInlineAtomDropTarget({
	editor,
	root,
	clientX,
	clientY,
}: ResolveInlineAtomDropTargetOptions): InlineAtomDropTarget | null {
	if (!root) {
		return null;
	}

	const point = pointToEditorSelectionPoint(root, clientX, clientY);
	if (!point) {
		return null;
	}

	return {
		editor,
		blockId: point.blockId,
		offset: point.offset,
	};
}

export function buildMoveInlineAtomOps(
	editor: Editor,
	source: Pick<InlineAtomSource, "blockId" | "offset">,
	target: SelectionPoint,
): DocumentOp[] {
	const sourceAtom = getInlineAtomAtOffset(editor, source);
	if (
		!sourceAtom ||
		!editor.getBlock(target.blockId) ||
		isNoopInlineAtomMove(source, target)
	) {
		return [];
	}

	const targetOffset = getAdjustedTargetOffset(source, target);
	return [
		{
			type: "delete-text",
			blockId: source.blockId,
			offset: source.offset,
			length: INLINE_ATOM_LOGICAL_LENGTH,
		},
		{
			type: "insert-inline-node",
			blockId: target.blockId,
			offset: targetOffset,
			nodeType: sourceAtom.type,
			props: { ...sourceAtom.props },
		},
	];
}

export function moveInlineAtom({
	source,
	target,
	apply,
}: MoveInlineAtomOptions): boolean {
	if (source.editor === target.editor) {
		return moveInlineAtomWithinEditor({ source, target, apply });
	}

	return moveInlineAtomBetweenEditors({ source, target, apply });
}

export function replaceInlineAtomWithText({
	source,
	text,
	selection = "end",
	apply,
}: ReplaceInlineAtomWithTextOptions): boolean {
	const sourceAtom = getInlineAtomAtOffset(source.editor, source);
	if (!sourceAtom) {
		return false;
	}

	const ops: DocumentOp[] = [
		{
			type: "delete-text",
			blockId: source.blockId,
			offset: source.offset,
			length: INLINE_ATOM_LOGICAL_LENGTH,
		},
	];
	if (text.length > 0) {
		ops.push({
			type: "insert-text",
			blockId: source.blockId,
			offset: source.offset,
			text,
		});
	}

	source.editor.apply(ops, apply ?? DEFAULT_APPLY_OPTIONS);

	const endOffset = source.offset + text.length;

	if (selection === "all") {
		source.editor.selectText(
			source.blockId,
			source.offset,
			endOffset,
		);
	} else if (selection === "end") {
		source.editor.selectText(source.blockId, endOffset, endOffset);
	}

	const fieldEditor = source.editor.internals.getSlot<FieldEditor>(
		FIELD_EDITOR_SLOT_KEY,
	);
	if (fieldEditor && selection !== "none") {
		if (selection === "all") {
			if (typeof fieldEditor.activateTextSelection === "function") {
				fieldEditor.activateTextSelection(
					source.blockId,
					source.offset,
					endOffset,
				);
			} else {
				fieldEditor.activate(source.blockId);
			}
		} else if (selection === "end") {
			if (typeof fieldEditor.activateTextSelection === "function") {
				fieldEditor.activateTextSelection(
					source.blockId,
					endOffset,
					endOffset,
				);
			} else {
				fieldEditor.activate(source.blockId);
			}
		}
		fieldEditor.focus();
	}

	return true;
}

function moveInlineAtomWithinEditor({
	source,
	target,
	apply,
}: MoveInlineAtomOptions): boolean {
	const ops = buildMoveInlineAtomOps(source.editor, source, target);
	if (ops.length === 0) {
		return false;
	}

	const targetOffset = getAdjustedTargetOffset(source, target);
	source.editor.apply(ops, apply ?? DEFAULT_APPLY_OPTIONS);
	source.editor.selectText(
		target.blockId,
		targetOffset + INLINE_ATOM_LOGICAL_LENGTH,
		targetOffset + INLINE_ATOM_LOGICAL_LENGTH,
	);
	return true;
}

function moveInlineAtomBetweenEditors({
	source,
	target,
	apply,
}: MoveInlineAtomOptions): boolean {
	const sourceAtom = getInlineAtomAtOffset(source.editor, source);
	if (
		!sourceAtom ||
		!target.editor.getBlock(target.blockId) ||
		!canInsertInlineAtom(target.editor, sourceAtom)
	) {
		return false;
	}

	const applyOptions = apply ?? DEFAULT_APPLY_OPTIONS;
	target.editor.apply(
		[
			{
				type: "insert-inline-node",
				blockId: target.blockId,
				offset: target.offset,
				nodeType: sourceAtom.type,
				props: { ...sourceAtom.props },
			},
		],
		applyOptions,
	);
	source.editor.apply(
		[
			{
				type: "delete-text",
				blockId: source.blockId,
				offset: source.offset,
				length: INLINE_ATOM_LOGICAL_LENGTH,
			},
		],
		applyOptions,
	);
	target.editor.selectText(
		target.blockId,
		target.offset + INLINE_ATOM_LOGICAL_LENGTH,
		target.offset + INLINE_ATOM_LOGICAL_LENGTH,
	);
	return true;
}

function canInsertInlineAtom(
	editor: Editor,
	atom: Pick<InlineAtomSnapshot, "type">,
): boolean {
	return editor.schema.resolveInline(atom.type)?.kind === "node";
}

function isNoopInlineAtomMove(
	source: Pick<InlineAtomSource, "blockId" | "offset">,
	target: Pick<InlineAtomDropTarget, "blockId" | "offset">,
): boolean {
	const sourceEndOffset = source.offset + INLINE_ATOM_LOGICAL_LENGTH;
	return (
		target.blockId === source.blockId &&
		target.offset >= source.offset &&
		target.offset <= sourceEndOffset
	);
}

function getAdjustedTargetOffset(
	source: Pick<InlineAtomSource, "blockId" | "offset">,
	target: Pick<InlineAtomDropTarget, "blockId" | "offset">,
): number {
	return target.blockId === source.blockId && target.offset > source.offset
		? target.offset - INLINE_ATOM_LOGICAL_LENGTH
		: target.offset;
}

function getInlineDeltaLength(delta: InlineDelta): number {
	return typeof delta.insert === "string"
		? delta.insert
				.replaceAll(ZERO_WIDTH_SPACE, "")
				.replaceAll(OBJECT_REPLACEMENT_CHARACTER, "").length
		: INLINE_ATOM_LOGICAL_LENGTH;
}

function getInlineAtomText(
	editor: Editor,
	atom: InlineNodeDeltaInsert,
): string {
	return (
		editor.schema
			.resolveInline(atom.type)
			?.serialize.toMarkdown?.("", atom.props) ?? ""
	);
}
