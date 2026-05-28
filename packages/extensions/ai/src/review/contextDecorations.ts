import type { Editor, InlineDecoration } from "@pen/types";
import type { AIExtensionConfig, AISession } from "../types";
import {
	AI_REVIEW_ROLE_ATTRIBUTE,
	AI_REVIEW_STATE_ATTRIBUTE,
	type AIReviewPresentationState,
} from "./reviewPresentationState";
import { AI_REVIEW_CONTEXT_STYLE } from "./reviewPresentationStyles";
import { subtractRanges } from "./rangeHelpers";
import type { SuggestionInlineRange } from "./suggestionDecorations";

type SuggestionPresentation = NonNullable<
	AIExtensionConfig["suggestionPresentation"]
>;

export function shouldShowSelectionContext({
	hasActiveStreamingReviewPreview,
	hasSuggestions,
	suggestionPresentation,
}: {
	hasActiveStreamingReviewPreview: boolean;
	hasSuggestions: boolean;
	suggestionPresentation: SuggestionPresentation;
}): boolean {
	if (
		suggestionPresentation === "final-text" &&
		(hasActiveStreamingReviewPreview || hasSuggestions)
	) {
		return false;
	}

	return true;
}

export function buildContextDecorations({
	activeSession,
	editor,
	reviewState,
	suggestionRangesByBlock,
}: {
	activeSession: AISession | null;
	editor: Editor;
	reviewState: AIReviewPresentationState;
	suggestionRangesByBlock: Map<string, SuggestionInlineRange[]>;
}): InlineDecoration[] {
	if (
		!activeSession ||
		activeSession.surface !== "inline-edit" ||
		!activeSession.contextualPrompt?.composer.isOpen ||
		reviewState === "resolved"
	) {
		return [];
	}

	const selectionSnapshot = resolveContextSelection(activeSession);
	if (!selectionSnapshot) {
		return [];
	}

	const decorations: InlineDecoration[] = [];
	const blockRange =
		selectionSnapshot.blockRange.length > 0
			? selectionSnapshot.blockRange
			: [selectionSnapshot.anchor.blockId];
	const firstBlockId = blockRange[0] ?? null;
	const lastBlockId = blockRange[blockRange.length - 1] ?? firstBlockId;
	if (!firstBlockId || !lastBlockId) {
		return decorations;
	}

	for (const blockId of blockRange) {
		const block = editor.getBlock(blockId);
		if (!block) {
			continue;
		}

		const isSingleBlock = firstBlockId === lastBlockId;
		const blockTextLength = block.textContent({ resolved: true }).length;
		const from = isSingleBlock
			? Math.min(
					selectionSnapshot.anchor.offset,
					selectionSnapshot.focus.offset,
				)
			: blockId === firstBlockId
				? resolveBoundaryOffset(selectionSnapshot, firstBlockId)
				: 0;
		const to = isSingleBlock
			? Math.max(
					selectionSnapshot.anchor.offset,
					selectionSnapshot.focus.offset,
				)
			: blockId === lastBlockId
				? resolveBoundaryOffset(selectionSnapshot, lastBlockId)
				: blockTextLength;
		if (to <= from) {
			continue;
		}

		const excludedRanges =
			reviewState === "user-reviewing"
				? (suggestionRangesByBlock.get(blockId) ?? [])
				: [];
		for (const range of subtractRanges({ from, to }, excludedRanges)) {
			decorations.push({
				type: "inline",
				blockId,
				from: range.from,
				to: range.to,
				key: `ai-review-context:${blockId}:${range.from}:${range.to}`,
				attributes: {
					class: "pen-ai-review-context pen-ai-affected-range",
					"data-ai-affected-range": "",
					"data-ai-affected-range-session": "",
					[AI_REVIEW_ROLE_ATTRIBUTE]: "context",
					[AI_REVIEW_STATE_ATTRIBUTE]: reviewState,
					style: AI_REVIEW_CONTEXT_STYLE,
				},
			});
		}
	}

	return decorations;
}

function resolveContextSelection(session: AISession) {
	const activeTurn =
		session.activeTurnId != null
			? (session.turns.find((turn) => turn.id === session.activeTurnId) ??
				null)
			: (session.turns[session.turns.length - 1] ?? null);

	return (
		activeTurn?.selection ??
		session.contextualPrompt?.anchor.selectionSnapshot ??
		(session.target.kind === "selection"
			? {
					anchor: { ...session.target.selection.anchor },
					focus: { ...session.target.selection.focus },
					blockRange: [...session.target.selection.blockRange],
					isMultiBlock: session.target.selection.isMultiBlock,
				}
			: null)
	);
}

function resolveBoundaryOffset(
	selectionSnapshot: NonNullable<ReturnType<typeof resolveContextSelection>>,
	blockId: string,
): number {
	if (selectionSnapshot.anchor.blockId === blockId) {
		return selectionSnapshot.anchor.offset;
	}
	return selectionSnapshot.focus.offset;
}
