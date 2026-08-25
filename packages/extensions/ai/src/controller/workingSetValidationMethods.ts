import type { DocumentOp, ToolRuntime } from "@input/pen-types";
import { buildDocumentWriteOps } from "@input/pen-document-ops";
import type { AIContentFormat } from "../runtime/contracts";
import type { RequestRouterDecision } from "../runtime/router";
import type {
	AISurface,
	AIWorkingSetEnvelope,
	AIWorkingSetRetrievedSpan,
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
import type { AIControllerMethodHost } from "./aiControllerMethodHost";

export const workingSetValidationMethods = {
	_validateWorkingSet(
		this: AIControllerMethodHost,
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

	_resolveMarkdownFastApplyWindow(
		this: AIControllerMethodHost,
		route: RequestRouterDecision,
		blockId: string,
	): {
		range: { startBlockId: string; endBlockId: string };
		blockIds: string[];
	} | null {
		const blocks = Array.from(this._editor.blocks());
		const blockIndex = blocks.findIndex((block) => block.id === blockId);
		if (blockIndex === -1) {
			return null;
		}

		const radius =
			route.targetKind === "table"
				? 0
				: route.intent === "continue"
					? 0
					: route.intent === "rewrite" ||
						  route.intent === "local-edit"
						? 1
						: 0;
		const startIndex = Math.max(0, blockIndex - radius);
		const endIndex = Math.min(blocks.length - 1, blockIndex + radius);
		const blockIds = blocks
			.slice(startIndex, endIndex + 1)
			.map((block) => block.id);
		return {
			range: {
				startBlockId: blockIds[0] ?? blockId,
				endBlockId: blockIds[blockIds.length - 1] ?? blockId,
			},
			blockIds,
		};
	},

	async _resolveMarkdownFastApplyRetrievedSpan(
		this: AIControllerMethodHost,
		toolRuntime: ToolRuntime,
		route: RequestRouterDecision,
		blockId: string,
		prompt: string,
	): Promise<AIWorkingSetRetrievedSpan | null> {
		if (route.applyStrategy !== "markdown-fast-apply") {
			return null;
		}

		try {
			const retrieved = (await toolRuntime.executeTool(
				"retrieve_document_spans",
				{
					query: prompt,
					maxResults: 1,
					includeSuggestions: this._state.suggestMode,
					activeBlockId: blockId,
					targetBlockId: blockId,
				},
				{} as never,
			)) as {
				spans?: AIWorkingSetRetrievedSpan[];
			};
			const retrievedSpan = retrieved.spans?.[0] ?? null;
			if (retrievedSpan?.blockIds?.length) {
				return retrievedSpan;
			}
		} catch {
			// Older test fixtures or stale builds may not register the retriever yet.
		}

		const markdownWindow = this._resolveMarkdownFastApplyWindow(
			route,
			blockId,
		);
		if (!markdownWindow) {
			return null;
		}
		return {
			id: `span:${markdownWindow.blockIds.join(":")}`,
			blockIds: markdownWindow.blockIds,
			range: markdownWindow.range,
			blockTypes: [],
			headingPath: [],
			preview: "",
			markdown: "",
			score: 0,
			rationale: "window-fallback",
			neighbors: {
				beforeBlockId: null,
				afterBlockId: null,
			},
		};
	},

	_captureBlockRevisions(
		this: AIControllerMethodHost,
		blockIds: readonly string[],
	): Record<string, number> {
		return Object.fromEntries(
			blockIds.map((trackedBlockId) => [
				trackedBlockId,
				this._editor.getBlockRevision(trackedBlockId),
			]),
		);
	},

	_captureBlockViewHashes(
		this: AIControllerMethodHost,
		blockIds: readonly string[],
	): Record<string, string> {
		return captureBlockViewHashes(
			this._editor,
			blockIds,
			this._state.suggestMode ? "raw" : "resolved",
		);
	},

	_resolveContentFormat(
		this: AIControllerMethodHost,
		target: GenerationState["target"],
		_surface?: AISurface,
	): AIContentFormat {
		if (target === "selection") {
			return this._contentFormat.selectionRewrite;
		}
		return this._contentFormat.blockGeneration;
	},

	_buildTextBlockGenerationOps(
		this: AIControllerMethodHost,
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
		this: AIControllerMethodHost,
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
