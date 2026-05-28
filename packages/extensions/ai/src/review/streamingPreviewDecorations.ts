import type {
	Decoration,
	Editor,
	InlineDecoration,
} from "@pen/types";
import type { AIExtensionConfig, AIStreamingReviewPreview } from "../types";
import { mapStreamingBlockRangeTextOffset } from "../suggestions/replacementPlan/blockRangeTextOffset";
import {
	buildStreamingPreviewPlan,
	normalizeStreamingBlockRange,
	type BlockRangeStreamingPreviewPlan,
	type StreamingPreviewPlanResult,
} from "../suggestions/replacementPlan/streamingPreviewPlan";
import {
	createStreamingDeleteBlockDecoration,
	createStreamingDeleteDecoration,
} from "./streamingPreviewDeleteDecorations";
import {
	appendVirtualPreviewTextDecorations,
	resolveStreamingPreviewAnchor,
	resolveStreamingPreviewInsertedTextStart,
} from "./streamingPreviewVirtualDecorations";

type SuggestionPresentation = NonNullable<
	AIExtensionConfig["suggestionPresentation"]
>;

export function buildStreamingReviewPreviewDecorations({
	editor,
	preview,
	suggestionPresentation,
}: {
	editor: Editor;
	preview: AIStreamingReviewPreview;
	suggestionPresentation: SuggestionPresentation;
}): Decoration[] {
	const text = preview.text;
	if (text.length === 0) {
		return [];
	}
	const anchor = resolveStreamingPreviewAnchor(preview);
	if (!anchor) {
		return [];
	}

	const decorations: Decoration[] = [];
	const replacementPlan = buildStreamingPreviewPlan(editor, preview);
	if (replacementPlan) {
		appendStreamingReplacementPreviewPlanDecorations(decorations, {
			editor,
			plan: replacementPlan,
			preview,
			suggestionPresentation,
		});
		return decorations;
	}

	appendStreamingPreviewDeletionDecorations(decorations, {
		editor,
		suggestionPresentation,
		target: preview.target,
	});
	appendVirtualPreviewTextDecorations(decorations, {
		blockId: anchor.blockId,
		offset: anchor.offset,
		preview,
		text,
		insertedTextStart: 0,
	});

	return decorations;
}

function appendStreamingReplacementPreviewPlanDecorations(
	decorations: Decoration[],
	{
		editor,
		plan,
		preview,
		suggestionPresentation,
	}: {
		editor: Editor;
		plan: StreamingPreviewPlanResult;
		preview: AIStreamingReviewPreview;
		suggestionPresentation: SuggestionPresentation;
	},
): void {
	if (plan.kind === "text-range") {
		if (plan.deleteTo > plan.deleteFrom) {
			decorations.push(
				createStreamingDeleteDecoration({
					blockId: plan.blockId,
					from: plan.deleteFrom,
					suggestionPresentation,
					to: plan.deleteTo,
				}),
			);
		}
		appendVirtualPreviewTextDecorations(decorations, {
			blockId: plan.blockId,
			offset: plan.insertOffset,
			preview,
			text: plan.text,
			insertedTextStart: resolveStreamingPreviewInsertedTextStart({
				decoratedText: plan.text,
				preview,
				planInsertedTextStart: plan.insertedTextStart,
			}),
		});
		return;
	}
	if (plan.kind === "aligned-block-range") {
		for (const textPlan of plan.plans) {
			appendStreamingReplacementPreviewPlanDecorations(decorations, {
				editor,
				plan: textPlan,
				preview,
				suggestionPresentation,
			});
		}
		return;
	}

	appendBlockRangeStreamingReplacementPreviewDecorations(decorations, {
		editor,
		plan,
		preview,
		suggestionPresentation,
	});
}

function appendBlockRangeStreamingReplacementPreviewDecorations(
	decorations: Decoration[],
	{
		editor,
		plan,
		preview,
		suggestionPresentation,
	}: {
		editor: Editor;
		plan: BlockRangeStreamingPreviewPlan;
		preview: AIStreamingReviewPreview;
		suggestionPresentation: SuggestionPresentation;
	},
): void {
	const insertPosition = mapStreamingBlockRangeTextOffset(
		editor,
		plan.normalizedRange,
		plan.deleteFromChar,
	);
	const deleteStartPosition = insertPosition;
	const deleteEndPosition = mapStreamingBlockRangeTextOffset(
		editor,
		plan.normalizedRange,
		plan.deleteToChar,
	);

	if (deleteStartPosition.blockId === deleteEndPosition.blockId) {
		if (deleteEndPosition.offset > deleteStartPosition.offset) {
			decorations.push(
				createStreamingDeleteDecoration({
					blockId: deleteStartPosition.blockId,
					from: deleteStartPosition.offset,
					suggestionPresentation,
					to: deleteEndPosition.offset,
				}),
			);
		}
	} else {
		appendPartialBlockRangeDeletionDecorations(decorations, {
			editor,
			deleteEndPosition,
			deleteStartPosition,
			normalizedRange: plan.normalizedRange,
			suggestionPresentation,
		});
	}

	appendVirtualPreviewTextDecorations(decorations, {
		blockId: insertPosition.blockId,
		offset: insertPosition.offset,
		preview,
		text: plan.insertText,
		insertedTextStart: resolveStreamingPreviewInsertedTextStart({
			decoratedText: plan.insertText,
			preview,
			planInsertedTextStart: plan.insertedTextStart,
		}),
	});
}

function appendPartialBlockRangeDeletionDecorations(
	decorations: Decoration[],
	{
		editor,
		deleteEndPosition,
		deleteStartPosition,
		normalizedRange,
		suggestionPresentation,
	}: {
		editor: Editor;
		deleteEndPosition: { blockId: string; offset: number };
		deleteStartPosition: { blockId: string; offset: number };
		normalizedRange: BlockRangeStreamingPreviewPlan["normalizedRange"];
		suggestionPresentation: SuggestionPresentation;
	},
): void {
	const orderedBlockIds = [
		normalizedRange.start.blockId,
		...normalizedRange.middleBlockIds,
		normalizedRange.end.blockId,
	].filter((blockId, index, blockIds) => blockIds.indexOf(blockId) === index);
	const deleteStartIndex = orderedBlockIds.indexOf(
		deleteStartPosition.blockId,
	);
	const deleteEndIndex = orderedBlockIds.indexOf(deleteEndPosition.blockId);
	if (deleteStartIndex < 0 || deleteEndIndex < 0) {
		return;
	}

	const fromIndex = Math.min(deleteStartIndex, deleteEndIndex);
	const toIndex = Math.max(deleteStartIndex, deleteEndIndex);

	const startBlockTextLength =
		editor.getBlock(deleteStartPosition.blockId)?.textContent().length ??
		deleteStartPosition.offset;
	if (deleteStartPosition.offset < startBlockTextLength) {
		decorations.push(
			createStreamingDeleteDecoration({
				blockId: deleteStartPosition.blockId,
				from: deleteStartPosition.offset,
				suggestionPresentation,
				to: startBlockTextLength,
			}),
		);
	}

	for (let index = fromIndex + 1; index < toIndex; index += 1) {
		const blockId = orderedBlockIds[index];
		if (!blockId) {
			continue;
		}
		decorations.push(createStreamingDeleteBlockDecoration(blockId));
	}

	if (
		deleteEndPosition.blockId !== deleteStartPosition.blockId &&
		deleteEndPosition.offset > 0
	) {
		decorations.push(
			createStreamingDeleteDecoration({
				blockId: deleteEndPosition.blockId,
				from: 0,
				suggestionPresentation,
				to: deleteEndPosition.offset,
			}),
		);
	}
}

function appendStreamingPreviewDeletionDecorations(
	decorations: Decoration[],
	input: {
		editor: Editor;
		suggestionPresentation: SuggestionPresentation;
		target: AIStreamingReviewPreview["target"];
	},
): void {
	switch (input.target.kind) {
		case "text-range": {
			const from = Math.min(input.target.from, input.target.to);
			const to = Math.max(input.target.from, input.target.to);
			if (to > from) {
				decorations.push(
					createStreamingDeleteDecoration({
						blockId: input.target.blockId,
						from,
						suggestionPresentation: input.suggestionPresentation,
						to,
					}),
				);
			}
			return;
		}
		case "block-range":
			appendStreamingBlockRangeDeletionDecorations(decorations, {
				editor: input.editor,
				suggestionPresentation: input.suggestionPresentation,
				target: input.target,
			});
			return;
		case "insertion-point":
			return;
		default: {
			const exhaustive: never = input.target;
			return exhaustive;
		}
	}
}

function appendStreamingBlockRangeDeletionDecorations(
	decorations: Decoration[],
	{
		editor,
		suggestionPresentation,
		target,
	}: {
		editor: Editor;
		suggestionPresentation: SuggestionPresentation;
		target: Extract<
			AIStreamingReviewPreview["target"],
			{ kind: "block-range" }
		>;
	},
): void {
	const normalizedRange = normalizeStreamingBlockRange(editor, target);
	if (!normalizedRange) {
		return;
	}

	if (normalizedRange.start.blockId === normalizedRange.end.blockId) {
		const from = Math.min(
			normalizedRange.start.offset,
			normalizedRange.end.offset,
		);
		const to = Math.max(
			normalizedRange.start.offset,
			normalizedRange.end.offset,
		);
		if (to > from) {
			decorations.push(
				createStreamingDeleteDecoration({
					blockId: normalizedRange.start.blockId,
					from,
					suggestionPresentation,
					to,
				}),
			);
		}
		return;
	}

	const startBlockTextLength =
		editor.getBlock(normalizedRange.start.blockId)?.textContent().length ??
		normalizedRange.start.offset;
	if (normalizedRange.start.offset < startBlockTextLength) {
		decorations.push(
			createStreamingDeleteDecoration({
				blockId: normalizedRange.start.blockId,
				from: normalizedRange.start.offset,
				suggestionPresentation,
				to: startBlockTextLength,
			}),
		);
	}

	if (normalizedRange.end.offset > 0) {
		decorations.push(
			createStreamingDeleteDecoration({
				blockId: normalizedRange.end.blockId,
				from: 0,
				suggestionPresentation,
				to: normalizedRange.end.offset,
			}),
		);
	}

	for (const blockId of normalizedRange.middleBlockIds) {
		decorations.push(createStreamingDeleteBlockDecoration(blockId));
	}
}
