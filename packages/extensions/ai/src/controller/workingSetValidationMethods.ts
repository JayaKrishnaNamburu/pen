import type { DocumentOp } from "@input/pen-types";
import { buildDocumentWriteOps } from "@input/pen-document-ops";
import type { AIContentFormat } from "../runtime/contracts";
import type { RequestRouterDecision } from "../runtime/router";
import type {
	AISurface,
	AIWorkingSetEnvelope,
	GenerationState,
} from "../types";
import type { GenerationTarget } from "../helpers";
import {
	resolveReplacementDeleteBlockIds,
	shouldReplaceEmptyMarkdownTarget,
	shouldTrimLeadingBlankBlockGenerationText,
	trimLeadingBlankBlockGenerationText,
} from "../helpers";
import {
	captureBlockViewHashes,
	viewHashesChanged,
} from "../runtime/viewHashes";
import type { AIControllerImpl } from "./aiController";

export const workingSetValidationMethods = {
	_validateWorkingSet(
		this: AIControllerImpl,
		route: RequestRouterDecision,
		target: GenerationTarget,
		workingSet: AIWorkingSetEnvelope | null,
	): { valid: boolean; canRefresh: boolean; reason?: string } {
		if (!workingSet) {
			return { valid: true, canRefresh: false };
		}

		const selectionSignature = this._createSelectionSignature(
			this._editor.selection,
		);
		const selectionChanged =
			workingSet.selectionSignature !== selectionSignature;
		// View hashes replace revision counters here. `_documentVersion`
		// increments on every commit, so using it would treat a props-only
		// apply as stale even when the rendered markdown did not change.
		const viewChanged = viewHashesChanged(
			workingSet.trackedBlockIds,
			workingSet.viewHashes,
			this._captureBlockViewHashes(workingSet.trackedBlockIds),
		);

		if (!selectionChanged && !viewChanged) {
			return { valid: true, canRefresh: false };
		}

		if (
			route.lane === "selection-rewrite" ||
			route.lane === "cursor-context"
		) {
			return {
				valid: false,
				canRefresh: false,
				reason: selectionChanged
					? "selection-provenance-changed"
					: "local-context-changed",
			};
		}

		return {
			valid: false,
			canRefresh: target.type === "block",
			reason: viewChanged ? "view-changed" : "selection-changed",
		};
	},

	_captureBlockViewHashes(
		this: AIControllerImpl,
		blockIds: readonly string[],
	): Record<string, string> {
		return captureBlockViewHashes(
			this._editor,
			blockIds,
			this._state.suggestMode ? "raw" : "resolved",
		);
	},

	_resolveContentFormat(
		this: AIControllerImpl,
		target: GenerationState["target"],
		_surface?: AISurface,
	): AIContentFormat {
		if (target === "selection") {
			return this._contentFormat.selectionRewrite;
		}
		return this._contentFormat.blockGeneration;
	},

	_buildTextBlockGenerationOps(
		this: AIControllerImpl,
		blockId: string,
		text: string,
		insertionOffset?: number,
	): DocumentOp[] {
		const targetBlock = this._editor.getBlock(blockId);
		const normalizedText = shouldTrimLeadingBlankBlockGenerationText(
			targetBlock,
		)
			? trimLeadingBlankBlockGenerationText(text)
			: text;
		if (normalizedText.length === 0) {
			return [];
		}
		return [
			{
				type: "splice-text",
				blockId,
				from: insertionOffset ?? targetBlock?.textContent().length ?? 0,
				to: insertionOffset ?? targetBlock?.textContent().length ?? 0,
				insert: normalizedText,
			},
		];
	},

	_buildMarkdownBlockGenerationOps(
		this: AIControllerImpl,
		blockId: string,
		text: string,
		replaceTargetBlock?: boolean,
		replaceBlockIds?: readonly string[],
	): DocumentOp[] {
		const targetBlock = this._editor.getBlock(blockId);
		if (!targetBlock) {
			return [];
		}

		const { ops } = buildDocumentWriteOps(this._editor, {
			format: "markdown",
			content: text,
			position: { after: blockId },
			surface: "ai-markdown",
		});
		if (
			!replaceTargetBlock &&
			!shouldReplaceEmptyMarkdownTarget(targetBlock)
		) {
			return ops;
		}

		const deleteBlockIds = resolveReplacementDeleteBlockIds(
			this._editor,
			blockId,
			replaceBlockIds,
		);
		return [
			...ops,
			...deleteBlockIds.map((nextBlockId) => ({
				type: "delete-block" as const,
				blockId: nextBlockId,
			})),
		];
	},
};
