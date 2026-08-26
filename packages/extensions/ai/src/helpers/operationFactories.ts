import {
	isCollapsed,
	resolveSelectionTargetBlockIds,
	selectionToRange,
	usesInlineTextSelection,
} from "@input/pen-core";
import { type Editor, type TextSelection } from "@input/pen-types";
import type { AIRequestedOperation, ResolvedEditTarget } from "../types";
import { resolveBlockInsertionOffset, resolveSelectionText } from "./selection";
import { recreateTextSelection } from "./session";

function createRewriteSelectionOperation(
	editor: Editor,
	selection: TextSelection,
	promptIntent: string,
	documentVersion: number,
	options?: {
		sourceText?: string;
	},
): AIRequestedOperation {
	const range = selectionToRange(editor.internals.doc, selection);
	return {
		kind: "rewrite-selection",
		promptIntent,
		target: {
			kind: "selection",
			blockId: range.start.blockId,
			anchor: { ...selection.anchor },
			focus: { ...selection.focus },
			sourceText:
				options?.sourceText ?? resolveSelectionText(editor, selection),
		},
		provenance: {
			documentVersion,
			selectionSignature: createSelectionSignature(selection),
			syncedGeneration: editor.documentState.generation,
		},
	};
}

export function createRewriteSelectionOperationFromResolvedTarget(
	editor: Editor,
	target: ResolvedEditTarget,
	promptIntent: string,
	documentVersion: number,
): AIRequestedOperation {
	const selection = recreateTextSelection(editor, {
		anchor: target.anchor,
		focus: target.focus,
		blockRange: resolveSelectionTargetBlockIds(editor, target),
		isMultiBlock:
			resolveSelectionTargetBlockIds(editor, target).length > 1 ||
			target.anchor.blockId !== target.focus.blockId,
	});
	if (target.kind === "selection") {
		return createRewriteSelectionOperation(
			editor,
			selection,
			promptIntent,
			documentVersion,
			{
				sourceText: target.sourceText,
			},
		);
	}
	return {
		kind: "rewrite-selection",
		promptIntent,
		target: {
			kind: "scoped-range",
			blockId: target.blockId,
			anchor: { ...target.anchor },
			focus: { ...target.focus },
			sourceText: target.sourceText,
			blockIds: [...target.blockIds],
			contentFormat: target.contentFormat,
			scope: target.scope,
		},
		provenance: {
			documentVersion,
			selectionSignature: createSelectionSignature(selection),
			syncedGeneration: editor.documentState.generation,
		},
	};
}

export function createRewriteBlockOperation(
	editor: Editor,
	blockId: string,
	promptIntent: string,
	documentVersion: number,
): AIRequestedOperation {
	const block = editor.getBlock(blockId);
	return {
		kind: "rewrite-block",
		promptIntent,
		target: {
			kind: "block",
			blockId,
			blockType: block?.type ?? null,
			sourceText: block?.textContent() ?? "",
		},
		provenance: {
			documentVersion,
			syncedGeneration: editor.documentState.generation,
		},
	};
}

export function createContinueBlockOperation(
	editor: Editor,
	blockId: string,
	promptIntent: string,
	documentVersion: number,
): AIRequestedOperation {
	const block = editor.getBlock(blockId);
	return {
		kind: "continue-block",
		promptIntent,
		target: {
			kind: "block",
			blockId,
			blockType: block?.type ?? null,
			sourceText: block?.textContent() ?? "",
			insertionOffset: resolveContinueInsertionOffset(editor, blockId),
		},
		provenance: {
			documentVersion,
			syncedGeneration: editor.documentState.generation,
		},
	};
}

export function createDocumentTransformOperation(
	editor: Editor,
	activeBlockId: string | null,
	promptIntent: string,
	documentVersion: number,
	options?: {
		blockIds?: readonly string[];
		placement?:
			| "append-after-block"
			| "replace-empty-block"
			| "replace-blocks";
		transform?: "write" | "rewrite" | "remove";
	},
): AIRequestedOperation {
	return {
		kind: "document-transform",
		promptIntent,
		target: {
			kind: "document",
			activeBlockId,
			blockIds: options?.blockIds,
			placement: options?.placement,
			transform: options?.transform,
		},
		provenance: {
			documentVersion,
			syncedGeneration: editor.documentState.generation,
		},
	};
}

function createSelectionSignature(selection: TextSelection): string {
	return [
		"text",
		selection.anchor.blockId,
		selection.anchor.offset,
		selection.focus.blockId,
		selection.focus.offset,
		String(isCollapsed(selection)),
	].join(":");
}

function resolveContinueInsertionOffset(
	editor: Editor,
	blockId: string,
): number {
	const selection = editor.selection;
	if (
		selection?.type === "text" &&
		isCollapsed(selection) &&
		selection.anchor.blockId === blockId
	) {
		return selection.anchor.offset;
	}
	return resolveBlockInsertionOffset(editor, blockId);
}

export function canUseLocalBlockTextOperation(
	editor: Editor,
	blockId: string,
): boolean {
	const block = editor.getBlock(blockId);
	if (!block) {
		return false;
	}
	const schema = editor.schema.resolve(block.type);
	if (!schema || !usesInlineTextSelection(schema)) {
		return false;
	}
	return resolveFullBlockTextSelection(editor, blockId) != null;
}

export function resolveFullBlockTextSelection(
	editor: Editor,
	blockId: string,
): TextSelection | null {
	const block = editor.getBlock(blockId);
	if (!block) {
		return null;
	}
	return recreateTextSelection(editor, {
		anchor: { blockId, offset: 0 },
		focus: { blockId, offset: block.textContent().length },
		blockRange: [blockId],
		isMultiBlock: false,
	});
}
