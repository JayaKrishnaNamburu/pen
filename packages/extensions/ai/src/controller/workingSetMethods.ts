import { selectionToRange } from "@input/pen-core";
import type { ToolRuntime } from "@input/pen-types";
import { buildMutationReceipt } from "../runtime/mutationReceipt";
import {
	AI_ANNOTATED_WORKING_SET_MAX_BLOCKS,
	refineRouteWithNavigator,
	type RequestRouterDecision,
} from "../runtime/router";
import type {
	AIMutationReceipt,
	AIWorkingSetEnvelope,
	GenerationState,
} from "../types";
import type { GenerationTarget } from "../helpers";
import { resolveSelectionText } from "../helpers";
import type { AIControllerImpl } from "./aiController";

export const workingSetMethods = {
	_buildFallbackMutationReceipt(
		this: AIControllerImpl,
		input: {
			/**
			 * Whether the assistant text this turn produced became a document
			 * commit. Text alone does not imply one: on the tool channel the
			 * text is the model talking and the edit arrives as a tool call,
			 * which applies directly and leaves no receipt for this path to
			 * describe (`spec/packages/extensions/ai.md` EC1).
			 */
			committedText: boolean;
			suggestionIds: readonly string[];
			adapterId: NonNullable<GenerationState["adapterId"]>;
			blockClass: NonNullable<GenerationState["blockClass"]>;
			transportKind: NonNullable<GenerationState["transportKind"]>;
		},
	): AIMutationReceipt {
		if (input.suggestionIds.length > 0) {
			return buildMutationReceipt({
				status: "staged_suggestions",
				adapterId: input.adapterId,
				blockClass: input.blockClass,
				transportKind: input.transportKind,
			});
		}
		return buildMutationReceipt({
			status: input.committedText ? "applied" : "noop",
			adapterId: input.adapterId,
			blockClass: input.blockClass,
			transportKind: input.transportKind,
		});
	},

	async _buildWorkingSet(
		this: AIControllerImpl,
		toolRuntime: ToolRuntime,
		route: RequestRouterDecision,
		target: GenerationTarget,
		blockId: string,
		_prompt: string,
		scope?: "document" | "block",
	): Promise<AIWorkingSetEnvelope | null> {
		const selectionSignature = this._createSelectionSignature(
			this._editor.selection,
		);
		if (target.type === "selection") {
			const trackedBlockIds = [
				...new Set(
					selectionToRange(
						this._editor.internals.doc,
						target.selection,
					).blockRange,
				),
			];
			return {
				documentVersion: this._documentVersion,
				viewMode: this._state.suggestMode ? "raw" : "resolved",
				source: "selection",
				routeConfidence: route.confidence,
				context: {
					selection: target.selection,
					selectedText: resolveSelectionText(
						this._editor,
						target.selection,
					),
				},
				trackedBlockIds,
				viewHashes: this._captureBlockViewHashes(trackedBlockIds),
				selectionSignature,
			};
		}

		// Document-scope prompts (e.g. chat) may edit anywhere, so give the
		// editing lanes the whole annotated document instead of a narrow
		// window around the anchor block when the document is small enough.
		// `edit_document` addresses blocks by the ids these annotations carry.
		if (
			scope === "document" &&
			route.editsArriveAsToolCalls &&
			this._editor.blockCount() <= AI_ANNOTATED_WORKING_SET_MAX_BLOCKS
		) {
			const context = (await toolRuntime.executeTool(
				"get_context",
				{
					format: "markdown",
					annotateBlocks: true,
					includeSelection: true,
					includeSuggestions: this._state.suggestMode,
				},
				{} as never,
			)) as {
				activeBlockType?: string | null;
				markdown?: string | null;
				blockIds?: string[];
				surroundingBlocks?: Array<{ id: string }>;
				selectedText?: string | null;
				structuredTarget?: {
					target?: {
						kind?: "block" | "table";
					};
				} | null;
			};
			const trackedBlockIds = [
				...new Set([blockId, ...(context.blockIds ?? [])]),
			];
			return {
				documentVersion: this._documentVersion,
				viewMode: this._state.suggestMode ? "raw" : "resolved",
				source: "document-summary",
				context: {
					...context,
					markdownWindow: {
						blockIds: context.blockIds ?? [blockId],
					},
				},
				routeConfidence: route.confidence,
				trackedBlockIds,
				viewHashes: this._captureBlockViewHashes(trackedBlockIds),
				selectionSignature,
			};
		}

		if (route.useCursorContext) {
			const context = (await toolRuntime.executeTool(
				"get_cursor_context",
				{ includeSuggestions: this._state.suggestMode },
				{} as never,
			)) as {
				activeBlockType?: string | null;
				markdown?: string | null;
				surroundingBlocks?: Array<{ id: string }>;
				selectedText?: string | null;
				structuredTarget?: {
					target?: {
						kind?: "block" | "table";
					};
				} | null;
			};
			const trackedBlockIds = [
				blockId,
				...(context.surroundingBlocks ?? []).map((block) => block.id),
			];
			return {
				documentVersion: this._documentVersion,
				viewMode: this._state.suggestMode ? "raw" : "resolved",
				source: "cursor-context",
				context,
				routeConfidence: refineRouteWithNavigator(route, {
					selectedTextLength: context.selectedText?.length ?? 0,
					activeBlockType: context.activeBlockType ?? null,
					structuredTargetKind:
						context.structuredTarget?.target?.kind ?? null,
				}).confidence,
				trackedBlockIds: [...new Set(trackedBlockIds)],
				viewHashes: this._captureBlockViewHashes(trackedBlockIds),
				selectionSignature,
			};
		}

		if (route.useDocumentSummary) {
			const context = (await toolRuntime.executeTool(
				"get_context",
				scope === "document"
					? {
							format: "summary",
							includeSelection: true,
							includeSuggestions: this._state.suggestMode,
						}
					: {
							format: "markdown",
							includeSelection: true,
							includeSuggestions: this._state.suggestMode,
							range: {
								startBlockId: blockId,
								endBlockId: blockId,
							},
						},
				{} as never,
			)) as {
				activeBlockType?: string | null;
				markdown?: string | null;
				surroundingBlocks?: Array<{ id: string }>;
				selectedText?: string | null;
				structuredTarget?: {
					target?: {
						kind?: "block" | "table";
					};
				} | null;
			};
			const trackedBlockIds = [
				blockId,
				...(context.surroundingBlocks ?? []).map((block) => block.id),
			];
			return {
				documentVersion: this._documentVersion,
				viewMode: this._state.suggestMode ? "raw" : "resolved",
				source: "document-summary",
				context,
				routeConfidence: refineRouteWithNavigator(route, {
					selectedTextLength: context.selectedText?.length ?? 0,
					activeBlockType: context.activeBlockType ?? null,
					structuredTargetKind:
						context.structuredTarget?.target?.kind ?? null,
				}).confidence,
				trackedBlockIds: [...new Set(trackedBlockIds)],
				viewHashes: this._captureBlockViewHashes(trackedBlockIds),
				selectionSignature,
			};
		}

		return {
			documentVersion: this._documentVersion,
			viewMode: this._state.suggestMode ? "raw" : "resolved",
			source: "document-summary",
			context: null,
			routeConfidence: route.confidence,
			trackedBlockIds: [blockId],
			viewHashes: this._captureBlockViewHashes([blockId]),
			selectionSignature,
		};
	},

	_refineRouteWithWorkingSet(
		this: AIControllerImpl,
		route: RequestRouterDecision,
		workingSet: AIWorkingSetEnvelope | null,
	): RequestRouterDecision {
		if (!workingSet?.context || typeof workingSet.context !== "object") {
			return route;
		}
		const context = workingSet.context as {
			activeBlockType?: string | null;
			markdown?: string | null;
			surroundingBlocks?: Array<{ id: string }>;
			selectedText?: string | null;
			structuredTarget?: {
				target?: {
					kind?: "block" | "table";
				};
			} | null;
		};
		return refineRouteWithNavigator(route, {
			selectedTextLength: context.selectedText?.length ?? 0,
			activeBlockType: context.activeBlockType ?? null,
			structuredTargetKind:
				context.structuredTarget?.target?.kind ?? null,
		});
	},
};
