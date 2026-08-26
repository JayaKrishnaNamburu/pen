import { isCollapsed } from "@input/pen-core";
import type { DocumentOp, OpOrigin, SelectionState } from "@input/pen-types";
import type { GenerationState } from "../types";
import type { AIControllerImpl } from "./aiController";

export const commitSupportMethods = {
	_applySuggestedAIOps(
		this: AIControllerImpl,
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
		this: AIControllerImpl,
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
				String(isCollapsed(selection)),
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
		this: AIControllerImpl,
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
				suggestionIds:
					overrides.suggestionIds ??
					activeGeneration.suggestionIds ??
					[],
			},
		});
	},
};
