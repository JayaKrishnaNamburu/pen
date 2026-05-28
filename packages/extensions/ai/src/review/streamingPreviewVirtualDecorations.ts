import type { Decoration, InlineDecoration } from "@pen/types";
import type { AIStreamingReviewPreview } from "../types";
import {
	AI_REVIEW_PREVIEW_NEW_ATTRIBUTE,
	AI_REVIEW_PREVIEW_VIRTUAL_ATTRIBUTE,
	AI_REVIEW_ROLE_ATTRIBUTE,
} from "./reviewPresentationState";
import {
	AI_REVIEW_INSERT_STYLE,
	AI_STREAMING_PREVIEW_CHAR_STAGGER_MS,
} from "./reviewPresentationStyles";

export function resolveStreamingPreviewInsertedTextStart({
	decoratedText,
	preview,
	planInsertedTextStart,
}: {
	decoratedText: string;
	preview: AIStreamingReviewPreview;
	planInsertedTextStart: number;
}): number {
	if (planInsertedTextStart <= 0) {
		return 0;
	}

	if (preview.text.length <= decoratedText.length + 1) {
		return 0;
	}

	if (planInsertedTextStart >= preview.text.length) {
		return 0;
	}

	if (preview.text.length >= decoratedText.length + planInsertedTextStart) {
		return planInsertedTextStart;
	}

	return 0;
}

export function resolveStreamingPreviewStableTextLength({
	decoratedText,
	insertedTextStart,
	preview,
}: {
	decoratedText: string;
	insertedTextStart: number;
	preview: AIStreamingReviewPreview;
}): number {
	if (insertedTextStart === 0) {
		return Math.max(
			0,
			Math.min(preview.previousTextLength, decoratedText.length),
		);
	}

	const previousDecoratedLength = Math.max(
		0,
		preview.previousTextLength - insertedTextStart,
	);
	return Math.max(0, Math.min(previousDecoratedLength, decoratedText.length));
}

export function resolveStreamingPreviewAnchor(
	preview: AIStreamingReviewPreview,
): { blockId: string; offset: number } | null {
	switch (preview.target.kind) {
		case "text-range":
			return {
				blockId: preview.target.blockId,
				offset: Math.min(preview.target.from, preview.target.to),
			};
		case "insertion-point":
			return {
				blockId: preview.target.blockId,
				offset: preview.target.offset,
			};
		case "block-range":
			return {
				blockId: preview.target.start.blockId,
				offset: preview.target.start.offset,
			};
		default: {
			const exhaustive: never = preview.target;
			return exhaustive;
		}
	}
}

export function appendVirtualPreviewTextDecorations(
	decorations: Decoration[],
	{
		blockId,
		insertedTextStart,
		offset,
		preview,
		text,
	}: {
		blockId: string;
		insertedTextStart: number;
		offset: number;
		preview: AIStreamingReviewPreview;
		text: string;
	},
): void {
	if (text.length === 0) {
		return;
	}

	const stableTextLength = resolveStreamingPreviewStableTextLength({
		decoratedText: text,
		insertedTextStart,
		preview,
	});
	const stableText = text.slice(0, stableTextLength);
	const newText = text.slice(stableTextLength);
	if (stableText.length > 0) {
		decorations.push(
			createVirtualPreviewDecoration({
				blockId,
				offset,
				preview,
				text: stableText,
				isNew: false,
				keySuffix: `stable:${blockId}:${offset}:${insertedTextStart}`,
			}),
		);
	}
	if (newText.length > 0) {
		Array.from(newText).forEach((character, index) => {
			decorations.push(
				createVirtualPreviewDecoration({
					blockId,
					offset,
					preview,
					text: character,
					isNew: true,
					keySuffix: `new:${blockId}:${offset}:${insertedTextStart + stableTextLength + index}`,
					animationDelayMs:
						index * AI_STREAMING_PREVIEW_CHAR_STAGGER_MS,
				}),
			);
		});
	}
}

function createVirtualPreviewDecoration({
	animationDelayMs,
	blockId,
	keySuffix,
	offset,
	preview,
	text,
	isNew,
}: {
	animationDelayMs?: number;
	blockId: string;
	keySuffix?: string;
	offset: number;
	preview: AIStreamingReviewPreview;
	text: string;
	isNew: boolean;
}): InlineDecoration {
	return {
		type: "inline",
		blockId,
		from: offset,
		to: offset,
		virtualText: text,
		virtualPlacement: "after",
		key: [
			"ai-streaming-review-preview",
			preview.sessionId,
			preview.turnId ?? "turn",
			preview.revision,
			keySuffix ?? (isNew ? "new" : "stable"),
		].join(":"),
		attributes: {
			class: [
				"pen-suggestion-insert",
				"pen-suggestion-final-text-change",
				"pen-ai-review-insert",
				"pen-ai-review-preview",
				isNew ? "pen-ai-review-preview-new" : "",
			]
				.filter(Boolean)
				.join(" "),
			[AI_REVIEW_ROLE_ATTRIBUTE]: "insert",
			[AI_REVIEW_PREVIEW_VIRTUAL_ATTRIBUTE]: true,
			[AI_REVIEW_PREVIEW_NEW_ATTRIBUTE]: isNew,
			"data-pen-ai-preview-streaming": true,
			"data-pen-ai-preview-revision": preview.revision,
			"data-pen-ai-preview-updated-at": preview.updatedAt,
			"data-pen-final-text-review-change": true,
			contenteditable: "false",
			style: isNew
				? buildStreamingPreviewNewStyle(animationDelayMs)
				: AI_REVIEW_INSERT_STYLE,
		},
	} as InlineDecoration;
}

function buildStreamingPreviewNewStyle(animationDelayMs = 0): string {
	return [
		AI_REVIEW_INSERT_STYLE,
		"animation: var(--pen-ai-review-preview-new-animation, none)",
		animationDelayMs > 0 ? `animation-delay: ${animationDelayMs}ms` : "",
	]
		.filter(Boolean)
		.join("; ");
}
