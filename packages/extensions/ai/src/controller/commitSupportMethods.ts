import type { DocumentOp, OpOrigin, SelectionState } from "@input/pen-types";
import type { GenerationState } from "../types";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";

export const commitSupportMethods = {
	_applySuggestedAIOps(
		this: AIControllerMethodHost,
		ops: readonly DocumentOp[],
		sessionId?: string,
		options?: {
			generationId?: string;
			origin?: OpOrigin;
			requestId?: string;
			suggestionIds?: readonly string[];
			turnId?: string;
			undoGroupId?: string;
		},
	): void {
		this._suggestedOperationRunner.apply([...ops], sessionId, options);
	},

	_createSelectionSignature(
		this: AIControllerMethodHost,
		selection: SelectionState,
	): string | null {
		if (!selection) {
			return null;
		}
		if (selection.type === "text") {
			return [
				"text",
				selection.anchor.blockId,
				selection.anchor.offset,
				selection.focus.blockId,
				selection.focus.offset,
				String(selection.isCollapsed),
			].join(":");
		}
		if (selection.type === "block") {
			return `block:${selection.blockIds.join(",")}`;
		}
		if (selection.type === "cell") {
			return [
				"cell",
				selection.blockId,
				selection.anchor.row,
				selection.anchor.col,
				selection.head.row,
				selection.head.col,
			].join(":");
		}
		return selection.type;
	},

	_resolveActiveGeneration(
		this: AIControllerMethodHost,
		overrides: Partial<GenerationState>,
	): void {
		const activeGeneration = this._state.activeGeneration;
		if (!activeGeneration) {
			return;
		}

		this._setState({
			activeGeneration: {
				...activeGeneration,
				...overrides,
				plan:
					overrides.planState === "none" ||
					overrides.planState === "rejected"
						? null
						: (overrides.plan ?? activeGeneration.plan),
				reviewItems:
					overrides.planState === "none" ||
					overrides.planState === "rejected"
						? []
						: (overrides.reviewItems ??
							activeGeneration.reviewItems ??
							[]),
				structuredPreview:
					overrides.planState === "none" ||
					overrides.planState === "rejected"
						? null
						: (overrides.structuredPreview ??
							activeGeneration.structuredPreview ??
							null),
				suggestionIds:
					overrides.suggestionIds ??
					activeGeneration.suggestionIds ??
					[],
			},
		});
	},
};
