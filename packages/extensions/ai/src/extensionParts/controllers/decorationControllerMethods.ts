import type { Decoration } from "@pen/types";
import { buildGenerationZoneDecorations } from "../../decorations/generationZone";
import { buildAIReviewPresentationDecorations } from "../../review/reviewPresentation";
import type {
	AIStreamingReviewPreviewInput,
	AIStreamingReviewPreviewTarget,
} from "../../types";
import { areStringArraysEqual } from "../extensionHelpers";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";

export const decorationControllerMethods = {
	setStreamingReviewPreview(
		this: AIControllerMethodHost,
		input: AIStreamingReviewPreviewInput,
	): void {
		const text = input.text ?? "";
		if (text.length === 0) {
			this.clearStreamingReviewPreview(input.sessionId);
			return;
		}
		const previous = this._state.streamingReviewPreview;
		const isSamePreview =
			previous?.sessionId === input.sessionId &&
			previous?.turnId === input.turnId &&
			previous?.target != null &&
			areStreamingReviewPreviewTargetsEqual(
				previous.target,
				input.target,
			);
		if (isSamePreview && previous.text === text) {
			return;
		}
		this._setState({
			streamingReviewPreview: {
				sessionId: input.sessionId,
				turnId: input.turnId,
				target: input.target,
				text,
				previousTextLength: isSamePreview ? previous.text.length : 0,
				revision: isSamePreview ? previous.revision + 1 : 1,
				updatedAt: Date.now(),
			},
		});
	},

	clearStreamingReviewPreview(this: AIControllerMethodHost, sessionId?: string): void {
		const previous = this._state.streamingReviewPreview;
		if (!previous) {
			return;
		}
		if (sessionId && previous.sessionId !== sessionId) {
			return;
		}
		this._setState({ streamingReviewPreview: null });
	},

	buildDecorations(this: AIControllerMethodHost): Decoration[] {
		const decorations = [
			...buildAIReviewPresentationDecorations({
				activeGeneration: this._state.activeGeneration,
				activeSessionId: this._state.activeSessionId,
				editor: this._editor,
				sessions: this._state.sessions,
				suggestionPresentation: this._suggestionPresentation,
				streamingReviewPreview: this._state.streamingReviewPreview,
			}),
			...buildGenerationZoneDecorations(this._state.activeGeneration),
		];
		return decorations;
	},
};

function areStreamingReviewPreviewTargetsEqual(
	left: AIStreamingReviewPreviewTarget,
	right: AIStreamingReviewPreviewTarget,
): boolean {
	if (left.kind !== right.kind) {
		return false;
	}

	switch (left.kind) {
		case "text-range":
			return (
				right.kind === "text-range" &&
				left.blockId === right.blockId &&
				left.from === right.from &&
				left.to === right.to
			);
		case "block-range":
			return (
				right.kind === "block-range" &&
				left.start.blockId === right.start.blockId &&
				left.start.offset === right.start.offset &&
				left.end.blockId === right.end.blockId &&
				left.end.offset === right.end.offset &&
				areStringArraysEqual(left.blockIds, right.blockIds)
			);
		case "insertion-point":
			return (
				right.kind === "insertion-point" &&
				left.blockId === right.blockId &&
				left.offset === right.offset
			);
		default: {
			const exhaustive: never = left;
			return exhaustive;
		}
	}
}
