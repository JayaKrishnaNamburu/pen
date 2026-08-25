import type { Decoration } from "@input/pen-types";
import type { AIStreamingReviewPreview } from "../types";
import {
	AI_REVIEW_PREVIEW_VIRTUAL_ATTRIBUTE,
	AI_REVIEW_ROLE_ATTRIBUTE,
} from "./reviewPresentationState";
import { AI_REVIEW_INSERT_STYLE } from "./reviewPresentationStyles";

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
		offset,
		preview,
		text,
	}: {
		blockId: string;
		offset: number;
		preview: AIStreamingReviewPreview;
		text: string;
	},
): void {
	if (text.length === 0) {
		return;
	}

	// Stable key so growing text updates the same span.
	decorations.push({
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
			blockId,
			String(offset),
		].join(":"),
		attributes: {
			class: [
				"pen-suggestion-insert",
				"pen-suggestion-final-text-change",
				"pen-ai-review-insert",
				"pen-ai-review-preview",
			].join(" "),
			[AI_REVIEW_ROLE_ATTRIBUTE]: "insert",
			[AI_REVIEW_PREVIEW_VIRTUAL_ATTRIBUTE]: true,
			"data-pen-ai-preview-streaming": true,
			"data-pen-final-text-review-change": true,
			contenteditable: "false",
			style: AI_REVIEW_INSERT_STYLE,
		},
	});
}
