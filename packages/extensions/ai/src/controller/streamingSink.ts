import type { DocumentRange } from "@input/pen-types";
import type { AIContentFormat, AIMutationMode } from "../runtime/contracts";
import type { GenerationTarget } from "../helpers";
import type { AISurface } from "../types";
import type { AIControllerImpl } from "./aiController";
import type { GenerationExecutionState } from "./generationExecutionState";
import {
	editDocumentReviewPreviewInput,
	markdownReviewPreviewInput,
	selectionReviewPreviewInput,
} from "./streamingPreviewInput";

/**
 * Where a generation's arriving text goes, and what close does with it.
 * Resolved once; delta application and finalize both switch on `kind`.
 *
 * - `direct-write` / `suggestion-splice`: already in the document.
 * - `review-preview`: paint while streaming, then commit (or clear) on close.
 * - `buffered-commit`: hold text, commit on close, no preview.
 * - `none`: text is talk (tool channel) or otherwise must not become a mutation.
 */
export type GenerationStreamingSink =
	| { kind: "direct-write" }
	| {
			kind: "suggestion-splice";
			blockId: string;
			firstFrom: number;
			firstTo: number;
			appendOffset: number;
	  }
	| {
			kind: "review-preview";
			format: "markdown";
			source: "markdown-block";
			blockId: string;
			offset: number;
			replaceTargetBlock: boolean;
			replaceBlockIds?: readonly string[];
	  }
	| {
			kind: "review-preview";
			format: "plain" | "markdown";
			source: "selection";
			range: Pick<DocumentRange, "start" | "end">;
	  }
	| { kind: "buffered-commit" }
	| { kind: "none" };

export function resolveGenerationStreamingSink(input: {
	target: GenerationTarget;
	shouldStreamDirectly: boolean;
	contentFormat: AIContentFormat;
	mutationMode: AIMutationMode;
	editsArriveAsToolCalls: boolean;
	surface: AISurface | undefined;
	selectionRange: Pick<DocumentRange, "start" | "end"> | null;
	replaceTargetBlock?: boolean;
	replaceBlockIds?: readonly string[];
}): GenerationStreamingSink {
	if (input.editsArriveAsToolCalls) {
		return { kind: "none" };
	}

	if (input.target.type === "block" && input.shouldStreamDirectly) {
		return { kind: "direct-write" };
	}

	const suggestedText =
		input.mutationMode === "streaming-suggestions" &&
		input.contentFormat === "text";
	if (
		suggestedText &&
		input.target.type === "selection" &&
		input.selectionRange &&
		input.selectionRange.start.blockId === input.selectionRange.end.blockId
	) {
		return {
			kind: "suggestion-splice",
			blockId: input.selectionRange.start.blockId,
			firstFrom: input.selectionRange.start.offset,
			firstTo: input.selectionRange.end.offset,
			appendOffset: input.selectionRange.end.offset,
		};
	}
	if (suggestedText && input.target.type === "block") {
		return {
			kind: "suggestion-splice",
			blockId: input.target.blockId,
			firstFrom: input.target.offset,
			firstTo: input.target.offset,
			appendOffset: input.target.offset,
		};
	}
	if (
		input.mutationMode === "streaming-suggestions" &&
		input.contentFormat === "markdown" &&
		input.target.type === "block" &&
		input.surface === "bottom-chat"
	) {
		return {
			kind: "review-preview",
			format: "markdown",
			source: "markdown-block",
			blockId: input.target.blockId,
			offset: input.target.offset,
			replaceTargetBlock: input.replaceTargetBlock === true,
			replaceBlockIds: input.replaceBlockIds,
		};
	}
	if (input.target.type === "selection" && input.selectionRange) {
		return {
			kind: "review-preview",
			format: input.contentFormat === "markdown" ? "markdown" : "plain",
			source: "selection",
			range: input.selectionRange,
		};
	}
	if (input.target.type === "block") {
		return { kind: "buffered-commit" };
	}
	return { kind: "none" };
}

export function applyGenerationStreamingDelta(
	controller: AIControllerImpl,
	state: GenerationExecutionState,
	nextDelta: string,
): void {
	const sink = state.streamingSink;
	switch (sink.kind) {
		case "direct-write":
			if (state.target.type === "block") {
				state.streamingTarget?.appendDelta(nextDelta);
			}
			return;
		case "suggestion-splice":
			applySuggestionSplice(controller, state, sink, nextDelta);
			return;
		case "review-preview":
			applyReviewPreviewDelta(controller, state, sink);
			return;
		case "buffered-commit":
		case "none":
			return;
		default: {
			const exhaustive: never = sink;
			return exhaustive;
		}
	}
}

function applySuggestionSplice(
	controller: AIControllerImpl,
	state: GenerationExecutionState,
	sink: Extract<GenerationStreamingSink, { kind: "suggestion-splice" }>,
	nextDelta: string,
): void {
	const from =
		state.streamedSuggestionLength === 0
			? sink.firstFrom
			: sink.appendOffset + state.streamedSuggestionLength;
	const to = state.streamedSuggestionLength === 0 ? sink.firstTo : from;
	controller._applySuggestedAIOps(
		[
			{
				type: "splice-text",
				blockId: sink.blockId,
				from,
				to,
				insert: nextDelta,
			},
		],
		state.context?.sessionId,
		{ undoGroupId: state.seedGeneration.undoGroupId },
	);
	state.streamedSuggestionLength += nextDelta.length;
}

function applyReviewPreviewDelta(
	controller: AIControllerImpl,
	state: GenerationExecutionState,
	sink: Extract<GenerationStreamingSink, { kind: "review-preview" }>,
): void {
	const active = controller._state.activeGeneration;
	if (!active) {
		return;
	}
	const sessionId = active.sessionId ?? active.id;
	if (sink.source === "markdown-block") {
		controller.setStreamingReviewPreview(
			markdownReviewPreviewInput(controller._editor, {
				sessionId,
				turnId: active.turnId,
				blockId: sink.blockId,
				offset: sink.offset,
				replaceTargetBlock: sink.replaceTargetBlock,
				replaceBlockIds: sink.replaceBlockIds,
				text: state.currentText,
			}),
		);
		return;
	}
	const preview = selectionReviewPreviewInput(controller._editor, {
		sessionId,
		turnId: active.turnId,
		range: sink.range,
		text: state.currentText,
		format: sink.format,
	});
	if (preview) {
		controller.setStreamingReviewPreview(preview);
	}
}

export function applyEditDocumentPreview(
	controller: AIControllerImpl,
	preview: {
		operationIndex: number;
		blockId: string;
		operation: string | null;
		text: string;
	},
	activeGeneration: NonNullable<
		AIControllerImpl["_state"]["activeGeneration"]
	>,
): void {
	controller.setStreamingReviewPreview(
		editDocumentReviewPreviewInput(controller._editor, {
			sessionId: activeGeneration.sessionId ?? activeGeneration.id,
			turnId: activeGeneration.turnId,
			operationIndex: preview.operationIndex,
			blockId: preview.blockId,
			operation: preview.operation,
			text: preview.text,
		}),
		{ activeGeneration },
	);
}
