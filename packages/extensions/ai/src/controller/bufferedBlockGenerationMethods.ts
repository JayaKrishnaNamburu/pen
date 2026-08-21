import type { AIApplyStrategy, AIContentFormat } from "../runtime/contracts";
import {
	MARKDOWN_FAST_APPLY_ROOT_TAG,
	normalizeFlowMarkdownOutput,
} from "../runtime/flowMarkdown";
import { buildMutationReceipt } from "../runtime/mutationReceipt";
import type {
	AIMutationReceipt,
	AIWorkingSetEnvelope,
	GenerationState,
} from "../types";
import { aiGroupedApplyOptions } from "../helpers";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";

export const bufferedBlockGenerationMethods = {
	_commitBufferedBlockGeneration(
		this: AIControllerMethodHost,
		blockId: string,
		text: string,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		contentFormat: AIContentFormat,
		sessionId?: string,
		options?: {
			applyStrategy?: AIApplyStrategy;
			insertionOffset?: number;
			workingSet?: AIWorkingSetEnvelope | null;
			replaceTargetBlock?: boolean;
			replaceBlockIds?: readonly string[];
		},
	): AIMutationReceipt {
		let fastApplyFallbackMode: "plain-markdown" | null = null;
		if (
			contentFormat === "markdown" &&
			options?.applyStrategy === "markdown-fast-apply" &&
			(options?.replaceBlockIds?.length ?? 0) === 0
		) {
			const fastApplyReceipt = this._commitBufferedMarkdownFastApply(
				blockId,
				text,
				mutationMode,
				sessionId,
				options.workingSet ?? null,
			);
			if (fastApplyReceipt) {
				return fastApplyReceipt;
			}
			if (!text.trim().startsWith(`<${MARKDOWN_FAST_APPLY_ROOT_TAG}>`)) {
				// Backward compatibility: tolerate plain markdown when the model
				// does not honor the fast-apply contract.
				fastApplyFallbackMode = "plain-markdown";
			} else {
				return buildMutationReceipt({
					status: "invalid",
					adapterId: "flow-markdown",
					blockClass: "flow",
					transportKind: "flow-text",
					issues: [
						"Fast apply contract could not be compiled safely.",
					],
				});
			}
		}

		const normalizedText =
			contentFormat === "markdown"
				? normalizeFlowMarkdownOutput(text)
				: text;
		const scopedReplaceBlockIds =
			contentFormat === "markdown"
				? (options?.replaceBlockIds?.filter(
						(candidateBlockId, index, allBlockIds) =>
							allBlockIds.indexOf(candidateBlockId) === index &&
							this._editor.getBlock(candidateBlockId) != null,
					) ?? [])
				: [];
		if (contentFormat === "markdown" && scopedReplaceBlockIds.length > 0) {
			if (normalizedText.trim().length > 0) {
				const verification = this._verifyMarkdownFastApplyResult(
					scopedReplaceBlockIds,
					normalizedText,
				);
				if (!verification.valid) {
					return buildMutationReceipt({
						status: "invalid",
						adapterId: "flow-markdown",
						blockClass: "flow",
						transportKind: "flow-text",
						issues: [
							"Scoped markdown replacement could not be verified safely.",
						],
					});
				}
			}
			const ops = this._buildMarkdownScopedReplacementOps(
				scopedReplaceBlockIds,
				normalizedText,
			);
			const scopedReplacementFallback =
				this._summarizeFastApplyFallbackOps(
					"scoped-replacement",
					ops,
					scopedReplaceBlockIds.length,
				);
			if (
				mutationMode === "persistent-suggestions" ||
				mutationMode === "streaming-suggestions" ||
				mutationMode === "staged-review"
			) {
				this._applySuggestedAIOps(ops, sessionId);
				this._recordFastApplyDebug({
					executionPath: "scoped-replacement",
					fallback: scopedReplacementFallback,
				});
				return buildMutationReceipt({
					status: ops.length > 0 ? "staged_suggestions" : "noop",
					ops,
					adapterId: "flow-markdown",
					blockClass: "flow",
					transportKind: "flow-text",
				});
			}
			this._editor.apply(
				ops,
				aiGroupedApplyOptions(this._state.activeGeneration?.undoGroupId),
			);
			this._recordFastApplyDebug({
				executionPath: "scoped-replacement",
				fallback: scopedReplacementFallback,
			});
			return buildMutationReceipt({
				status: ops.length > 0 ? "applied" : "noop",
				ops,
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
			});
		}
		if (
			contentFormat === "markdown" &&
			(mutationMode === "persistent-suggestions" ||
				mutationMode === "streaming-suggestions" ||
				mutationMode === "staged-review") &&
			this._applySuggestedMarkdownPlaceholderReplacement(
				blockId,
				normalizedText,
				sessionId,
				options?.replaceTargetBlock,
				options?.replaceBlockIds,
			)
		) {
			if (fastApplyFallbackMode) {
				this._recordFastApplyDebug({
					executionPath: "plain-markdown",
					fallback: this._summarizeFastApplyFallbackOps(
						"plain-markdown",
						[],
					),
				});
			}
			return buildMutationReceipt({
				status: "staged_suggestions",
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
			});
		}

		const ops =
			contentFormat === "markdown"
				? this._buildMarkdownBlockGenerationOps(
						blockId,
						normalizedText,
						options?.replaceTargetBlock,
						options?.replaceBlockIds,
					)
				: this._buildTextBlockGenerationOps(
						blockId,
						normalizedText,
						options?.insertionOffset,
					);
		if (ops.length === 0) {
			if (fastApplyFallbackMode) {
				this._recordFastApplyDebug({
					executionPath: "plain-markdown",
					fallback: this._summarizeFastApplyFallbackOps(
						"plain-markdown",
						ops,
					),
				});
			}
			return buildMutationReceipt({
				status: "noop",
				ops,
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
			});
		}
		if (
			mutationMode === "persistent-suggestions" ||
			mutationMode === "streaming-suggestions" ||
			mutationMode === "staged-review"
		) {
			this._applySuggestedAIOps(ops, sessionId);
			if (fastApplyFallbackMode) {
				this._recordFastApplyDebug({
					executionPath: "plain-markdown",
					fallback: this._summarizeFastApplyFallbackOps(
						"plain-markdown",
						ops,
					),
				});
			}
			return buildMutationReceipt({
				status: "staged_suggestions",
				ops,
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
			});
		}
		this._editor.apply(
			ops,
			aiGroupedApplyOptions(this._state.activeGeneration?.undoGroupId),
		);
		if (fastApplyFallbackMode) {
			this._recordFastApplyDebug({
				executionPath: "plain-markdown",
				fallback: this._summarizeFastApplyFallbackOps(
					"plain-markdown",
					ops,
				),
			});
		}
		return buildMutationReceipt({
			status: "applied",
			ops,
			adapterId: "flow-markdown",
			blockClass: "flow",
			transportKind: "flow-text",
		});
	},
};
