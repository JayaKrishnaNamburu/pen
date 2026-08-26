import type { AIContentFormat } from "../runtime/contracts";
import { normalizeFlowMarkdownOutput } from "../runtime/flowMarkdown";
import { buildMutationReceipt } from "../runtime/mutationReceipt";
import type {
	AIMutationReceipt,
	AIWorkingSetEnvelope,
	GenerationState,
} from "../types";
import { aiGroupedApplyOptions } from "../helpers";
import type { AIControllerImpl } from "./aiController";

export const bufferedBlockGenerationMethods = {
	_commitBufferedBlockGeneration(
		this: AIControllerImpl,
		blockId: string,
		text: string,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		contentFormat: AIContentFormat,
		sessionId?: string,
		options?: {
			insertionOffset?: number;
			workingSet?: AIWorkingSetEnvelope | null;
			replaceTargetBlock?: boolean;
			replaceBlockIds?: readonly string[];
		},
	): AIMutationReceipt {
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
				const verification = this._verifyMarkdownCommitResult(
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
			const scopedReplacementFallback = this._summarizeCommitFallbackOps(
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
				this._recordCommitDebug({
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
				aiGroupedApplyOptions(
					this._state.activeGeneration?.undoGroupId,
				),
			);
			this._recordCommitDebug({
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
		return buildMutationReceipt({
			status: "applied",
			ops,
			adapterId: "flow-markdown",
			blockClass: "flow",
			transportKind: "flow-text",
		});
	},
};
