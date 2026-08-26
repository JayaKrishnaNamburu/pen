import {
	isCollapsed,
	renderSelectionTargetBlockText,
	resolveSelectionTargetBlockIds,
	selectionToRange,
	usesInlineTextSelection,
} from "@input/pen-core";
import {
	isScopedSelectionTarget,
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
} from "../runtime/promptTargeting";
import { classifyPromptIntent } from "../runtime/router";
import { readAllSuggestions } from "../suggestions/persistent";
import type {
	AICommandExecutionOptions,
	AIRequestedOperation,
	AISession,
	AISessionMetrics,
	AISessionTarget,
	FastApplyDebugState,
	PersistentTextSuggestion,
	ResolvedEditProposal,
	ResolvedEditTarget,
} from "../types";
import { areStructuredValuesEqual } from "./equality";
import { resolveBlockInsertionOffset, resolveSelectionText } from "./selection";
import {
	recreateTextSelection,
	resolveSessionTarget,
	selectionMatchesSnapshot,
} from "./session";
import {
	resolveActiveBlockId,
	resolveSessionBlockId,
	resolveSessionSelectionSnapshot,
} from "./types";

export function resolveRequestedOperationForSession(
	editor: Editor,
	session: AISession,
	prompt: string,
	options: AICommandExecutionOptions | undefined,
	documentVersion: number,
): AIRequestedOperation {
	const explicitTarget = options?.target;
	const promptIntent = classifyPromptIntent(prompt);
	const capturedSelection = resolveSessionSelectionTarget(editor, session);
	const liveSelection =
		session.surface === "inline-edit"
			? capturedSelection
			: editor.selection?.type === "text" &&
				!isCollapsed(editor.selection)
				? editor.selection
				: capturedSelection;
	const activeBlockId =
		options?.blockId ??
		resolveSessionBlockId(editor, session) ??
		resolveActiveBlockId(editor.selection) ??
		editor.lastBlock()?.id ??
		editor.firstBlock()?.id ??
		null;
	const documentActiveBlockId =
		options?.blockId ??
		resolveActiveBlockId(editor.selection) ??
		session.anchor?.blockId ??
		null;
	const resolvedEditProposal = resolveResolvedEditProposal(
		editor,
		session,
		prompt,
		promptIntent,
		explicitTarget,
		liveSelection,
		"markdown",
	);
	const clearDocument =
		session.target.kind === "document" && isClearDocumentPrompt(prompt);
	const documentBlockIds = editor.documentState.blockOrder.filter(
		(blockId) => editor.getBlock(blockId) != null,
	);
	const documentTransformPlan = clearDocument
		? {
				blockIds: documentBlockIds,
				placement: "replace-blocks" as const,
				transform: "remove" as const,
			}
		: undefined;

	if (resolvedEditProposal) {
		return createRewriteSelectionOperationFromResolvedTarget(
			editor,
			resolvedEditProposal.target,
			resolvedEditProposal.promptIntent,
			documentVersion,
		);
	}
	if (promptIntent === "continue" && activeBlockId) {
		if (!canUseLocalBlockTextOperation(editor, activeBlockId)) {
			return createDocumentTransformOperation(
				editor,
				activeBlockId,
				promptIntent,
				documentVersion,
				{
					blockIds: [activeBlockId],
					placement: "append-after-block",
					transform: "write",
				},
			);
		}
		return createContinueBlockOperation(
			editor,
			activeBlockId,
			promptIntent,
			documentVersion,
		);
	}
	if (
		activeBlockId &&
		(promptIntent === "rewrite" ||
			(promptIntent === "local-edit" &&
				(editor.getBlock(activeBlockId)?.textContent().length ?? 0) >
					0) ||
			explicitTarget === "block")
	) {
		if (!canUseLocalBlockTextOperation(editor, activeBlockId)) {
			return createDocumentTransformOperation(
				editor,
				activeBlockId,
				promptIntent,
				documentVersion,
				{
					blockIds: [activeBlockId],
					placement: "replace-blocks",
					transform: "rewrite",
				},
			);
		}
		return createRewriteBlockOperation(
			editor,
			activeBlockId,
			promptIntent,
			documentVersion,
		);
	}
	if (explicitTarget === "document") {
		return createDocumentTransformOperation(
			editor,
			documentActiveBlockId,
			promptIntent,
			documentVersion,
			documentTransformPlan,
		);
	}
	return createDocumentTransformOperation(
		editor,
		session.target.kind === "document"
			? documentActiveBlockId
			: activeBlockId,
		promptIntent,
		documentVersion,
		documentTransformPlan,
	);
}

export function resolveLocalOperationContentFormat(
	editor: Editor,
	operation: AIRequestedOperation,
	defaultBlockFormat: AIContentFormat,
): AIContentFormat {
	if (operation.kind === "rewrite-selection") {
		return operation.target.kind === "scoped-range"
			? operation.target.contentFormat
			: "text";
	}
	if (operation.kind === "document-transform") {
		return defaultBlockFormat;
	}
	if (operation.kind !== "rewrite-block") {
		return "text";
	}
	const blockId =
		operation.target.kind === "block" ? operation.target.blockId : null;
	if (blockId && resolveFullBlockTextSelection(editor, blockId)) {
		return "text";
	}
	return defaultBlockFormat;
}

function canUseLocalBlockTextOperation(
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

export function canReuseBottomChatSessionOperation(
	previousOperation: AIRequestedOperation,
	nextOperation: AIRequestedOperation,
): boolean {
	const previousResolvedTarget =
		resolveResolvedEditTargetFromRequestedOperation(previousOperation);
	const nextResolvedTarget =
		resolveResolvedEditTargetFromRequestedOperation(nextOperation);
	if (previousResolvedTarget && nextResolvedTarget) {
		return areResolvedEditTargetsEqual(
			previousResolvedTarget,
			nextResolvedTarget,
		);
	}
	if (previousOperation.kind !== nextOperation.kind) {
		return false;
	}
	if (previousOperation.target.kind !== nextOperation.target.kind) {
		return false;
	}
	if (
		previousOperation.target.kind === "selection" ||
		previousOperation.target.kind === "scoped-range"
	) {
		if (
			nextOperation.target.kind !== "selection" &&
			nextOperation.target.kind !== "scoped-range"
		) {
			return false;
		}
		return (
			previousOperation.provenance?.selectionSignature ===
				nextOperation.provenance?.selectionSignature &&
			previousOperation.target.sourceText ===
				nextOperation.target.sourceText
		);
	}
	if (previousOperation.target.kind === "block") {
		if (nextOperation.target.kind !== "block") {
			return false;
		}
		return (
			previousOperation.target.blockId === nextOperation.target.blockId &&
			previousOperation.provenance?.blockRevision ===
				nextOperation.provenance?.blockRevision
		);
	}
	if (nextOperation.target.kind !== "document") {
		return false;
	}
	return (
		previousOperation.target.activeBlockId ===
			nextOperation.target.activeBlockId &&
		areStructuredValuesEqual(
			previousOperation.target.blockIds ?? [],
			nextOperation.target.blockIds ?? [],
		) &&
		(previousOperation.target.placement ?? null) ===
			(nextOperation.target.placement ?? null) &&
		(previousOperation.target.transform ?? null) ===
			(nextOperation.target.transform ?? null)
	);
}

function resolveResolvedEditTargetFromRequestedOperation(
	operation: AIRequestedOperation,
): ResolvedEditTarget | null {
	if (
		operation.target.kind !== "selection" &&
		operation.target.kind !== "scoped-range"
	) {
		return null;
	}
	return operation.target;
}

function areResolvedEditTargetsEqual(
	previousTarget: ResolvedEditTarget,
	nextTarget: ResolvedEditTarget,
): boolean {
	if (previousTarget.kind !== nextTarget.kind) {
		return false;
	}
	if (
		previousTarget.blockId !== nextTarget.blockId ||
		previousTarget.sourceText !== nextTarget.sourceText ||
		previousTarget.anchor.blockId !== nextTarget.anchor.blockId ||
		previousTarget.anchor.offset !== nextTarget.anchor.offset ||
		previousTarget.focus.blockId !== nextTarget.focus.blockId ||
		previousTarget.focus.offset !== nextTarget.focus.offset
	) {
		return false;
	}
	if (
		previousTarget.kind === "scoped-range" &&
		nextTarget.kind === "scoped-range"
	) {
		return (
			previousTarget.scope === nextTarget.scope &&
			previousTarget.contentFormat === nextTarget.contentFormat &&
			areStructuredValuesEqual(
				previousTarget.blockIds,
				nextTarget.blockIds,
			)
		);
	}
	return true;
}

export function buildSessionExecutionPrompt(
	session: AISession | null,
	prompt: string,
): string {
	if (!session) {
		return prompt;
	}
	const previousPrompts = session.promptHistory
		.map((item) => item.prompt.trim())
		.filter((item) => item.length > 0)
		.slice(-4);
	if (previousPrompts.length === 0) {
		return prompt;
	}
	const historyLines = previousPrompts.map(
		(previousPrompt, index) => `${index + 1}. ${previousPrompt}`,
	);
	const intro =
		session.surface === "inline-edit"
			? "You are continuing an existing inline editor edit session."
			: "You are continuing an existing editor chat session.";
	const applyInstruction =
		session.surface === "inline-edit"
			? "Apply the latest request to the current selected document state."
			: "Apply the latest request to the current document state.";
	return [
		intro,
		"Earlier user requests in this same session:",
		...historyLines,
		"",
		applyInstruction,
		"Latest request:",
		prompt,
	].join("\n");
}

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
		applyPolicy: "selection-replace",
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
			blockRevision: editor.getBlockRevision(range.start.blockId),
			selectionSignature: createSelectionSignature(selection),
			syncedGeneration: editor.documentState.generation,
		},
	};
}

function createRewriteSelectionOperationFromResolvedTarget(
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
		applyPolicy: "selection-replace",
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
			blockRevision: editor.getBlockRevision(
				target.blockId ?? selection.anchor.blockId,
			),
			selectionSignature: createSelectionSignature(selection),
			syncedGeneration: editor.documentState.generation,
		},
	};
}

function createRewriteBlockOperation(
	editor: Editor,
	blockId: string,
	promptIntent: string,
	documentVersion: number,
): AIRequestedOperation {
	const block = editor.getBlock(blockId);
	return {
		kind: "rewrite-block",
		applyPolicy: "block-replace",
		promptIntent,
		target: {
			kind: "block",
			blockId,
			blockType: block?.type ?? null,
			sourceText: block?.textContent() ?? "",
		},
		provenance: {
			documentVersion,
			blockRevision: editor.getBlockRevision(blockId),
			syncedGeneration: editor.documentState.generation,
		},
	};
}

function createContinueBlockOperation(
	editor: Editor,
	blockId: string,
	promptIntent: string,
	documentVersion: number,
): AIRequestedOperation {
	const block = editor.getBlock(blockId);
	return {
		kind: "continue-block",
		applyPolicy: "block-continue",
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
			blockRevision: editor.getBlockRevision(blockId),
			syncedGeneration: editor.documentState.generation,
		},
	};
}

function createDocumentTransformOperation(
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
		applyPolicy: "document-review",
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

export function resolvePreviousGeneratedBlockIds(session: AISession): string[] {
	const completedTurns = session.turns.filter(
		(turn) => turn.status === "complete" || turn.status === "accepted",
	);
	const lastTurnWithBlocks = completedTurns
		.slice()
		.reverse()
		.find((turn) => turn.generatedBlockIds.length > 0);
	return lastTurnWithBlocks?.generatedBlockIds ?? [];
}

export function shouldReplacePreviousGeneratedBlocks(
	session: AISession,
	prompt: string,
): boolean {
	return (
		session.surface === "bottom-chat" &&
		session.target.kind === "document" &&
		(classifyPromptIntent(prompt) === "rewrite" ||
			isDocumentResetPrompt(prompt) ||
			isDocumentFollowUpEditPrompt(prompt))
	);
}

export function resolveReplacementDeleteBlockIds(
	editor: Editor,
	blockId: string,
	replaceBlockIds?: readonly string[],
): string[] {
	const requestedIds =
		replaceBlockIds && replaceBlockIds.length > 0
			? replaceBlockIds
			: [blockId];
	const deleteBlockIds = requestedIds.filter(
		(candidateBlockId, index, allBlockIds) =>
			allBlockIds.indexOf(candidateBlockId) === index &&
			editor.getBlock(candidateBlockId) != null,
	);
	return deleteBlockIds.length > 0 ? deleteBlockIds : [blockId];
}

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

function resolveResolvedEditProposal(
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

export function resolveSelectionForRequestedOperation(
	editor: Editor,
	operation: AIRequestedOperation,
): TextSelection | null {
	if (
		operation.target.kind !== "selection" &&
		operation.target.kind !== "scoped-range"
	) {
		return null;
	}
	return recreateTextSelection(editor, {
		anchor: operation.target.anchor,
		focus: operation.target.focus,
		blockRange: resolveSelectionTargetBlockIds(editor, operation.target),
		isMultiBlock:
			resolveSelectionTargetBlockIds(editor, operation.target).length >
				1 ||
			operation.target.anchor.blockId !== operation.target.focus.blockId,
	});
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

function parseParagraphReference(prompt: string): number | null {
	const match = prompt.match(
		/\b(?:(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)|(\d+)(?:st|nd|rd|th))\s+paragraph\b/i,
	);
	if (!match) {
		return null;
	}
	const wordOrdinal = match[1]?.toLowerCase();
	if (wordOrdinal) {
		return resolveWordOrdinal(wordOrdinal);
	}
	const numericOrdinal = Number.parseInt(match[2] ?? "", 10);
	return Number.isFinite(numericOrdinal) && numericOrdinal > 0
		? numericOrdinal
		: null;
}

function resolveWordOrdinal(word: string): number | null {
	switch (word) {
		case "first":
			return 1;
		case "second":
			return 2;
		case "third":
			return 3;
		case "fourth":
			return 4;
		case "fifth":
			return 5;
		case "sixth":
			return 6;
		case "seventh":
			return 7;
		case "eighth":
			return 8;
		case "ninth":
			return 9;
		case "tenth":
			return 10;
		default:
			return null;
	}
}

export function resolveBlockIdForRequestedOperation(
	operation: AIRequestedOperation,
): string | null {
	if (operation.target.kind === "block") {
		return operation.target.blockId;
	}
	if (
		operation.target.kind === "selection" ||
		operation.target.kind === "scoped-range"
	) {
		return operation.target.blockId;
	}
	return operation.target.activeBlockId;
}

export function resolveRequestedOperationConflict(
	editor: Editor,
	operation: AIRequestedOperation,
	currentSelectionSignature: string | null,
): string | null {
	if (
		operation.target.kind === "selection" ||
		operation.target.kind === "scoped-range"
	) {
		const selection = resolveSelectionForRequestedOperation(
			editor,
			operation,
		);
		if (!selection) {
			return "The selected range no longer exists.";
		}
		if (isScopedSelectionTarget(operation.target)) {
			if (
				renderSelectionTargetBlockText(editor, operation.target) !==
				operation.target.sourceText
			) {
				return "The selected text changed before the rewrite completed.";
			}
			return null;
		}
		if (
			operation.provenance?.selectionSignature != null &&
			operation.provenance.selectionSignature !==
				currentSelectionSignature
		) {
			return "The selected range changed before the rewrite completed.";
		}
		if (
			resolveSelectionText(editor, selection) !==
			operation.target.sourceText
		) {
			return "The selected text changed before the rewrite completed.";
		}
		return null;
	}
	if (operation.target.kind === "block") {
		const block = editor.getBlock(operation.target.blockId);
		if (!block) {
			return "The target block no longer exists.";
		}
		if (
			operation.provenance?.blockRevision != null &&
			editor.getBlockRevision(operation.target.blockId) !==
				operation.provenance.blockRevision
		) {
			return "The target block changed before the operation completed.";
		}
		return null;
	}
	if (
		operation.provenance?.syncedGeneration != null &&
		editor.documentState.generation !==
			operation.provenance.syncedGeneration
	) {
		return "The document changed before the operation completed.";
	}
	return null;
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

function resolveSessionSelectionTarget(
	editor: Editor,
	session: AISession,
): TextSelection | null {
	const anchorSelection = session.contextualPrompt?.anchor.selectionSnapshot;
	if (session.target.kind !== "selection" && !anchorSelection) {
		return null;
	}
	const activeTurnSelection = session.activeTurnId
		? session.turns.find((turn) => turn.id === session.activeTurnId)
				?.selection
		: session.turns[session.turns.length - 1]?.selection;
	if (activeTurnSelection) {
		const restoredSelection = recreateTextSelection(
			editor,
			activeTurnSelection,
		);
		if (!isCollapsed(restoredSelection)) {
			return restoredSelection;
		}
	}
	const selection = editor.selection;
	if (
		selection?.type === "text" &&
		!isCollapsed(selection) &&
		selectionMatchesSnapshot(
			editor,
			selection,
			session.target.kind === "selection"
				? resolveSessionSelectionSnapshot(editor, session.target.selection)
				: (anchorSelection ?? null),
		)
	) {
		return selection;
	}
	if (anchorSelection) {
		const restoredSelection = recreateTextSelection(
			editor,
			anchorSelection,
		);
		if (!isCollapsed(restoredSelection)) {
			return restoredSelection;
		}
	}
	if (
		session.target.kind === "selection" &&
		!isCollapsed(session.target.selection)
	) {
		return session.target.selection;
	}
	return null;
}

export function resolveLiveInlineSelectionTarget(
	editor: Editor,
): Extract<AISessionTarget, { kind: "selection" }> | null {
	const selection = editor.selection;
	if (selection?.type !== "text" || isCollapsed(selection)) {
		return null;
	}
	const target = resolveSessionTarget(editor, "selection");
	return target.kind === "selection" ? target : null;
}

export function resolvePendingInlineSelectionTarget(
	editor: Editor,
	operation: AIRequestedOperation | undefined,
	suggestionIds: readonly string[],
): Extract<AISessionTarget, { kind: "selection" }> | null {
	if (
		operation?.kind !== "rewrite-selection" ||
		operation.target.kind !== "selection" ||
		operation.target.anchor.blockId !== operation.target.focus.blockId
	) {
		return null;
	}
	const textSuggestions = readAllSuggestions(editor).filter(
		(suggestion): suggestion is PersistentTextSuggestion =>
			suggestion.kind === "text" &&
			(suggestion.action === "insert" ||
				suggestion.action === "delete") &&
			suggestionIds.includes(suggestion.id),
	);
	if (textSuggestions.length === 0) {
		return null;
	}
	const blockId = operation.target.anchor.blockId;
	const startOffset = Math.min(
		operation.target.anchor.offset,
		operation.target.focus.offset,
	);
	const previewSpanLength = textSuggestions.reduce(
		(totalLength, suggestion) => totalLength + suggestion.length,
		0,
	);
	const endOffset = startOffset + previewSpanLength;
	if (endOffset <= startOffset) {
		return null;
	}
	return {
		kind: "selection",
		blockId,
		selection: recreateTextSelection(editor, {
			anchor: { blockId, offset: startOffset },
			focus: { blockId, offset: endOffset },
			blockRange: [blockId],
			isMultiBlock: false,
		}),
	};
}

export function resolveAcceptedInlineSelectionTarget(
	editor: Editor,
	operation: AIRequestedOperation | undefined,
	suggestionIds: readonly string[],
): Extract<AISessionTarget, { kind: "selection" }> | null {
	if (
		operation?.kind !== "rewrite-selection" ||
		operation.target.kind !== "selection" ||
		operation.target.anchor.blockId !== operation.target.focus.blockId
	) {
		return null;
	}
	const insertSuggestions = readAllSuggestions(editor).filter(
		(suggestion): suggestion is PersistentTextSuggestion =>
			suggestion.kind === "text" &&
			suggestion.action === "insert" &&
			suggestionIds.includes(suggestion.id),
	);
	if (insertSuggestions.length === 0) {
		return null;
	}
	const blockId = operation.target.anchor.blockId;
	const startOffset = Math.min(
		operation.target.anchor.offset,
		operation.target.focus.offset,
	);
	const insertedLength = insertSuggestions.reduce(
		(totalLength, suggestion) => totalLength + suggestion.length,
		0,
	);
	const endOffset = startOffset + insertedLength;
	if (endOffset <= startOffset) {
		return null;
	}
	return {
		kind: "selection",
		blockId,
		selection: recreateTextSelection(editor, {
			anchor: { blockId, offset: startOffset },
			focus: { blockId, offset: endOffset },
			blockRange: [blockId],
			isMultiBlock: false,
		}),
	};
}

function shouldCloseInlineSessionPrompt(session: AISession): boolean {
	return (
		session.surface === "inline-edit" && session.contextualPrompt != null
	);
}

export function closeInlineSessionPrompt(
	session: AISession,
): AISession["contextualPrompt"] | undefined {
	if (!shouldCloseInlineSessionPrompt(session) || !session.contextualPrompt) {
		return session.contextualPrompt;
	}

	return {
		...session.contextualPrompt,
		composer: {
			...session.contextualPrompt.composer,
			isOpen: false,
			isSubmitting: false,
		},
	};
}

export function createDefaultSessionFastApplyMetrics(): AISessionMetrics["fastApply"] {
	return {
		attemptCount: 0,
		nativeFastApplyCount: 0,
		scopedReplacementCount: 0,
		plainMarkdownCount: 0,
		failedCount: 0,
	};
}

export function accumulateSessionFastApplyMetrics(
	current: AISessionMetrics["fastApply"] | undefined,
	fastApply: FastApplyDebugState | undefined,
): AISessionMetrics["fastApply"] {
	const next = {
		...(current ?? createDefaultSessionFastApplyMetrics()),
	};
	if (!fastApply?.attempted) {
		return next;
	}
	next.attemptCount += 1;
	switch (fastApply.executionPath) {
		case "native-fast-apply":
			next.nativeFastApplyCount += 1;
			return next;
		case "scoped-replacement":
			next.scopedReplacementCount += 1;
			return next;
		case "plain-markdown":
			next.plainMarkdownCount += 1;
			return next;
		default:
			next.failedCount += 1;
			return next;
	}
}
