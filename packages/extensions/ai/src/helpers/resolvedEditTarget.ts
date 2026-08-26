import { selectionToRange } from "@input/pen-core";
import {
	type Editor,
	type ModelOperationScopedRangeTarget,
	type TextSelection,
} from "@input/pen-types";
import type { AIContentFormat } from "../runtime/contracts";
import {
	isClearDocumentPrompt,
	isDocumentFollowUpEditPrompt,
	isDocumentResetPrompt,
	isWholeDocumentRewritePrompt,
	parseParagraphReference,
} from "../runtime/promptTargeting";
import type {
	AICommandExecutionOptions,
	AISession,
	ResolvedEditProposal,
	ResolvedEditTarget,
} from "../types";
import { resolveSelectionText } from "./selection";
import { recreateTextSelection } from "./session";

function createResolvedSelectionEditTarget(
	editor: Editor,
	selection: TextSelection,
): ResolvedEditTarget {
	const range = selectionToRange(editor.internals.doc, selection);
	return {
		kind: "selection",
		blockId: range.start.blockId,
		anchor: { ...selection.anchor },
		focus: { ...selection.focus },
		sourceText: resolveSelectionText(editor, selection),
	};
}

function createResolvedScopedEditTarget(
	editor: Editor,
	selection: TextSelection,
	scope: ModelOperationScopedRangeTarget["scope"],
	contentFormat: AIContentFormat,
): ResolvedEditTarget {
	const range = selectionToRange(editor.internals.doc, selection);
	return {
		kind: "scoped-range",
		scope,
		blockId: range.start.blockId,
		anchor: { ...selection.anchor },
		focus: { ...selection.focus },
		blockIds: [...range.blockRange],
		sourceText: resolveSelectionText(editor, selection),
		contentFormat,
	};
}

function createResolvedEditProposal(
	promptIntent: string,
	target: ResolvedEditTarget,
): ResolvedEditProposal {
	return {
		promptIntent,
		target,
	};
}

export function resolveResolvedEditProposal(
	editor: Editor,
	session: AISession,
	prompt: string,
	promptIntent: string,
	explicitTarget: AICommandExecutionOptions["target"] | undefined,
	liveSelection: TextSelection | null,
	defaultBlockFormat: AIContentFormat,
): ResolvedEditProposal | null {
	if (liveSelection && explicitTarget === "selection") {
		return createResolvedEditProposal(
			promptIntent,
			createResolvedSelectionEditTarget(editor, liveSelection),
		);
	}

	const selectionScopedSession = session.target.kind === "selection";
	if (
		liveSelection &&
		(session.surface === "inline-edit" ||
			(selectionScopedSession &&
				(promptIntent === "rewrite" || promptIntent === "local-edit")))
	) {
		return createResolvedEditProposal(
			promptIntent,
			createResolvedSelectionEditTarget(editor, liveSelection),
		);
	}

	if (session.target.kind !== "document" && explicitTarget !== "document") {
		return null;
	}
	if (
		promptIntent === "continue" ||
		promptIntent === "review" ||
		promptIntent === "search" ||
		promptIntent === "structural"
	) {
		return null;
	}

	const titleSelection = resolveDocumentTitleSelection(editor, prompt);
	if (titleSelection) {
		return createResolvedEditProposal(
			promptIntent,
			createResolvedScopedEditTarget(
				editor,
				titleSelection,
				"heading",
				defaultBlockFormat,
			),
		);
	}

	const paragraphSelection = resolveDocumentParagraphSelection(
		editor,
		prompt,
	);
	if (paragraphSelection) {
		return createResolvedEditProposal(
			promptIntent,
			createResolvedScopedEditTarget(
				editor,
				paragraphSelection,
				"paragraph",
				defaultBlockFormat,
			),
		);
	}

	const documentBlockIds = editor.documentState.blockOrder.filter(
		(blockId) => editor.getBlock(blockId) != null,
	);
	const documentHasMeaningfulContent = documentBlockIds.some((blockId) => {
		const block = editor.getBlock(blockId);
		return (block?.textContent().trim().length ?? 0) > 0;
	});
	const shouldRewriteDocumentScope =
		!documentHasMeaningfulContent ||
		promptIntent === "rewrite" ||
		isClearDocumentPrompt(prompt) ||
		isWholeDocumentRewritePrompt(prompt) ||
		isDocumentResetPrompt(prompt) ||
		isDocumentFollowUpEditPrompt(prompt);
	if (!shouldRewriteDocumentScope) {
		return null;
	}

	const documentSelection = resolveDocumentBlockRangeSelection(
		editor,
		documentBlockIds,
	);
	if (!documentSelection) {
		return null;
	}
	return createResolvedEditProposal(
		promptIntent,
		createResolvedScopedEditTarget(
			editor,
			documentSelection,
			"document",
			defaultBlockFormat,
		),
	);
}

function resolveDocumentBlockRangeSelection(
	editor: Editor,
	blockIds: readonly string[],
): TextSelection | null {
	const resolvedBlockIds = blockIds.filter(
		(blockId, index, allBlockIds) =>
			allBlockIds.indexOf(blockId) === index &&
			editor.getBlock(blockId) != null,
	);
	const firstBlockId = resolvedBlockIds[0];
	const lastBlockId = resolvedBlockIds[resolvedBlockIds.length - 1];
	if (!firstBlockId || !lastBlockId) {
		return null;
	}
	const lastBlock = editor.getBlock(lastBlockId);
	return recreateTextSelection(editor, {
		anchor: { blockId: firstBlockId, offset: 0 },
		focus: {
			blockId: lastBlockId,
			offset: lastBlock?.textContent().length ?? 0,
		},
		blockRange: resolvedBlockIds,
		isMultiBlock: resolvedBlockIds.length > 1,
	});
}

function resolveDocumentTitleSelection(
	editor: Editor,
	prompt: string,
): TextSelection | null {
	if (!/\b(title|heading)\b/i.test(prompt)) {
		return null;
	}
	const headingBlockId =
		editor.documentState.blockOrder.find((blockId) => {
			const block = editor.getBlock(blockId);
			return (
				block?.type === "heading" || block?.type.startsWith("heading-")
			);
		}) ??
		editor.firstBlock()?.id ??
		null;
	return headingBlockId
		? resolveDocumentBlockRangeSelection(editor, [headingBlockId])
		: null;
}

function resolveDocumentParagraphSelection(
	editor: Editor,
	prompt: string,
): TextSelection | null {
	const paragraphIndex = parseParagraphReference(prompt);
	if (paragraphIndex == null) {
		return null;
	}
	const paragraphBlockIds = editor.documentState.blockOrder.filter(
		(blockId) => {
			const block = editor.getBlock(blockId);
			if (!block) {
				return false;
			}
			return (
				block.type === "paragraph" ||
				(block.textContent().trim().length > 0 &&
					block.type !== "heading" &&
					!block.type.startsWith("heading-"))
			);
		},
	);
	const targetParagraphBlockId =
		paragraphBlockIds[paragraphIndex - 1] ?? null;
	return targetParagraphBlockId
		? resolveDocumentBlockRangeSelection(editor, [targetParagraphBlockId])
		: null;
}
