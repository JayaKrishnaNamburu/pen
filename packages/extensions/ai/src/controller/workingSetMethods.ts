import { selectionToRange } from "@input/pen-core";
import type { ToolRuntime } from "@input/pen-types";
import { buildMutationReceipt } from "../runtime/mutationReceipt";
import type { StructuralReviewItem } from "../runtime/reviewArtifacts";
import {
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
import type { AIControllerMethodHost } from "./aiControllerMethodHost";

export const workingSetMethods = {
	_buildFallbackMutationReceipt(
		this: AIControllerMethodHost,
		input: {
			currentText: string;
			suggestionIds: readonly string[];
			reviewItems: readonly StructuralReviewItem[];
			planExecutionIssueCount: number;
			adapterId: NonNullable<GenerationState["adapterId"]>;
			blockClass: NonNullable<GenerationState["blockClass"]>;
			transportKind: NonNullable<GenerationState["transportKind"]>;
		},
	): AIMutationReceipt {
		if (input.planExecutionIssueCount > 0) {
			return buildMutationReceipt({
				status: "invalid",
				adapterId: input.adapterId,
				blockClass: input.blockClass,
				transportKind: input.transportKind,
				issues: ["The generated mutation plan could not be executed."],
			});
		}
		if (input.reviewItems.length > 0) {
			return buildMutationReceipt({
				status: "staged_review",
				adapterId: input.adapterId,
				blockClass: input.blockClass,
				transportKind: input.transportKind,
			});
		}
		if (input.suggestionIds.length > 0) {
			return buildMutationReceipt({
				status: "staged_suggestions",
				adapterId: input.adapterId,
				blockClass: input.blockClass,
				transportKind: input.transportKind,
			});
		}
		return buildMutationReceipt({
			status: input.currentText.trim().length > 0 ? "applied" : "noop",
			adapterId: input.adapterId,
			blockClass: input.blockClass,
			transportKind: input.transportKind,
		});
	},

	async _buildWorkingSet(
		this: AIControllerMethodHost,
		toolRuntime: ToolRuntime,
		route: RequestRouterDecision,
		target: GenerationTarget,
		blockId: string,
		prompt: string,
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
				blockRevisions: this._captureBlockRevisions(trackedBlockIds),
				selectionSignature,
			};
		}

		if (route.useCursorContext) {
			const retrievedSpan =
				await this._resolveMarkdownFastApplyRetrievedSpan(
					toolRuntime,
					route,
					blockId,
					prompt,
				);
			if (
				route.applyStrategy === "markdown-fast-apply" &&
				retrievedSpan
			) {
				const context = (await toolRuntime.executeTool(
					"get_context",
					{
						format: "markdown",
						includeSelection: true,
						includeSuggestions: this._state.suggestMode,
						range: retrievedSpan.range,
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
				return {
					documentVersion: this._documentVersion,
					viewMode: this._state.suggestMode ? "raw" : "resolved",
					source: "cursor-context",
					context: {
						...context,
						retrievedSpan,
					},
					routeConfidence: refineRouteWithNavigator(route, {
						surroundingBlockCount: retrievedSpan.blockIds.length,
						selectedTextLength: context.selectedText?.length ?? 0,
						activeBlockType: context.activeBlockType ?? null,
						structuredTargetKind:
							context.structuredTarget?.target?.kind ?? null,
					}).confidence,
					trackedBlockIds: [...new Set(retrievedSpan.blockIds)],
					blockRevisions: this._captureBlockRevisions(
						retrievedSpan.blockIds,
					),
					selectionSignature,
				};
			}
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
					surroundingBlockCount:
						context.surroundingBlocks?.length ?? 0,
					selectedTextLength: context.selectedText?.length ?? 0,
					activeBlockType: context.activeBlockType ?? null,
					structuredTargetKind:
						context.structuredTarget?.target?.kind ?? null,
				}).confidence,
				trackedBlockIds: [...new Set(trackedBlockIds)],
				blockRevisions: this._captureBlockRevisions(trackedBlockIds),
				selectionSignature,
			};
		}

		if (route.useDocumentSummary) {
			const retrievedSpan =
				await this._resolveMarkdownFastApplyRetrievedSpan(
					toolRuntime,
					route,
					blockId,
					prompt,
				);
			if (
				route.applyStrategy === "markdown-fast-apply" &&
				retrievedSpan
			) {
				const context = (await toolRuntime.executeTool(
					"get_context",
					{
						format: "markdown",
						includeSelection: true,
						includeSuggestions: this._state.suggestMode,
						range: retrievedSpan.range,
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
				return {
					documentVersion: this._documentVersion,
					viewMode: this._state.suggestMode ? "raw" : "resolved",
					source: "document-summary",
					context: {
						...context,
						retrievedSpan,
					},
					routeConfidence: refineRouteWithNavigator(route, {
						surroundingBlockCount: retrievedSpan.blockIds.length,
						selectedTextLength: context.selectedText?.length ?? 0,
						activeBlockType: context.activeBlockType ?? null,
						structuredTargetKind:
							context.structuredTarget?.target?.kind ?? null,
					}).confidence,
					trackedBlockIds: [...new Set(retrievedSpan.blockIds)],
					blockRevisions: this._captureBlockRevisions(
						retrievedSpan.blockIds,
					),
					selectionSignature,
				};
			}
			const context = (await toolRuntime.executeTool(
				"get_context",
				{
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
					surroundingBlockCount:
						context.surroundingBlocks?.length ?? 0,
					selectedTextLength: context.selectedText?.length ?? 0,
					activeBlockType: context.activeBlockType ?? null,
					structuredTargetKind:
						context.structuredTarget?.target?.kind ?? null,
				}).confidence,
				trackedBlockIds: [...new Set(trackedBlockIds)],
				blockRevisions: this._captureBlockRevisions(trackedBlockIds),
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
			blockRevisions: this._captureBlockRevisions([blockId]),
			selectionSignature,
		};
	},

	_refineRouteWithWorkingSet(
		this: AIControllerMethodHost,
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
			surroundingBlockCount: context.surroundingBlocks?.length ?? 0,
			selectedTextLength: context.selectedText?.length ?? 0,
			activeBlockType: context.activeBlockType ?? null,
			structuredTargetKind:
				context.structuredTarget?.target?.kind ?? null,
		});
	},
};
