import { shouldExposeBlockInTooling } from "@input/pen-core";
import { buildDocumentMutationPlanExecution } from "../runtime/planExecutor";
import {
	validateDocumentMutationPlanShape,
	type PlanValidationContext,
} from "../runtime/planValidation";
import {
	applyMarkdownFastApply,
	parseMarkdownFastApplyContract,
} from "../runtime/markdownFastApply";
import { parseMarkdownPatchPlanContract } from "../runtime/markdownPatchPlan";
import { buildMutationReceipt } from "../runtime/mutationReceipt";
import type {
	AIMutationReceipt,
	AIWorkingSetEnvelope,
	AIWorkingSetRetrievedSpan,
	GenerationState,
} from "../types";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";

export const markdownFastApplyMethods = {
	_commitBufferedMarkdownFastApply(
		this: AIControllerMethodHost,
		blockId: string,
		text: string,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		sessionId: string | undefined,
		workingSet: AIWorkingSetEnvelope | null,
	): AIMutationReceipt | null {
		const fastApplyScope = this._resolveMarkdownFastApplyScope(
			blockId,
			workingSet,
		);
		if (!fastApplyScope) {
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: false,
				fallbackReason: "missing-scope",
			});
			return null;
		}

		const patchPlan = parseMarkdownPatchPlanContract(text);
		if (patchPlan) {
			const validation = validateDocumentMutationPlanShape(
				patchPlan,
				this._buildPlanValidationContext(
					blockId,
					fastApplyScope.blockIds,
				),
			);
			if (!validation.valid) {
				this._recordFastApplyDebug({
					attempted: true,
					succeeded: false,
					contextChars: fastApplyScope.markdown.length,
					fallbackReason: "invalid-patch-plan",
					verificationFailureReason: validation.issues[0]?.message,
				});
				return null;
			}

			const execution = buildDocumentMutationPlanExecution(
				this._editor,
				patchPlan,
			);
			if (execution.issues.length > 0) {
				this._recordFastApplyDebug({
					attempted: true,
					succeeded: false,
					contextChars: fastApplyScope.markdown.length,
					fallbackReason: "patch-plan-execution",
					verificationFailureReason: execution.issues[0]?.message,
					alignment: execution.metrics?.flowPatchAlignment,
					executionPath: "native-fast-apply",
				});
				return null;
			}

			const verification = this._verifyFlowPatchPlanResult(
				patchPlan,
				execution.ops,
				fastApplyScope.blockIds,
			);
			if (!verification.valid) {
				this._recordFastApplyDebug({
					attempted: true,
					succeeded: false,
					contextChars: fastApplyScope.markdown.length,
					diffChars: text.length,
					fallbackReason: "verification-failed",
					verificationFailureReason: verification.reason,
					untouchedBlockMutationCount:
						verification.untouchedBlockMutationCount,
					alignment: execution.metrics?.flowPatchAlignment,
					executionPath: "native-fast-apply",
				});
				return null;
			}

			if (execution.ops.length === 0) {
				this._recordFastApplyDebug({
					attempted: true,
					succeeded: true,
					contextChars: fastApplyScope.markdown.length,
					diffChars: text.length,
					confidence: patchPlan.confidence?.score,
					untouchedBlockMutationCount:
						verification.untouchedBlockMutationCount,
					alignment: execution.metrics?.flowPatchAlignment,
					executionPath: "native-fast-apply",
				});
				return buildMutationReceipt({
					status: "noop",
					ops: execution.ops,
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
				this._applySuggestedAIOps(execution.ops, sessionId);
				this._recordFastApplyDebug({
					attempted: true,
					succeeded: true,
					contextChars: fastApplyScope.markdown.length,
					diffChars: text.length,
					confidence: patchPlan.confidence?.score,
					untouchedBlockMutationCount:
						verification.untouchedBlockMutationCount,
					alignment: execution.metrics?.flowPatchAlignment,
					executionPath: "native-fast-apply",
				});
				return buildMutationReceipt({
					status: "staged_suggestions",
					ops: execution.ops,
					adapterId: "flow-markdown",
					blockClass: "flow",
					transportKind: "flow-text",
				});
			}

			this._editor.apply(execution.ops, {
				origin: "ai",
				undoGroup: true,
			});
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: true,
				contextChars: fastApplyScope.markdown.length,
				diffChars: text.length,
				confidence: patchPlan.confidence?.score,
				untouchedBlockMutationCount:
					verification.untouchedBlockMutationCount,
				alignment: execution.metrics?.flowPatchAlignment,
				executionPath: "native-fast-apply",
			});
			return buildMutationReceipt({
				status: "applied",
				ops: execution.ops,
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
			});
		}

		const contract = parseMarkdownFastApplyContract(text);
		if (!contract) {
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: false,
				contextChars: fastApplyScope.markdown.length,
				fallbackReason: "unparseable-contract",
			});
			return null;
		}

		const merged = applyMarkdownFastApply({
			originalMarkdown: fastApplyScope.markdown,
			contract,
		});
		if (!merged.success || !merged.mergedMarkdown) {
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: false,
				contextChars: fastApplyScope.markdown.length,
				confidence: merged.confidence,
				fallbackReason: merged.fallbackReason ?? "merge-failed",
				verificationFailureReason: merged.issues[0],
			});
			return null;
		}

		const verification = this._verifyMarkdownFastApplyResult(
			fastApplyScope.blockIds,
			merged.mergedMarkdown,
		);
		if (!verification.valid) {
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: false,
				contextChars: fastApplyScope.markdown.length,
				diffChars: merged.diff?.length ?? 0,
				confidence: merged.confidence,
				fallbackReason: "verification-failed",
				verificationFailureReason: verification.reason,
				untouchedBlockMutationCount: 0,
			});
			return null;
		}

		const ops = this._buildMarkdownScopedReplacementOps(
			fastApplyScope.blockIds,
			merged.mergedMarkdown,
		);
		const scopedReplacementFallback = this._summarizeFastApplyFallbackOps(
			"scoped-replacement",
			ops,
			fastApplyScope.blockIds.length,
		);
		if (ops.length === 0) {
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: true,
				executionPath: "scoped-replacement",
				contextChars: fastApplyScope.markdown.length,
				diffChars: merged.diff?.length ?? 0,
				confidence: merged.confidence,
				untouchedBlockMutationCount: 0,
				fallback: scopedReplacementFallback,
			});
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
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: true,
				executionPath: "scoped-replacement",
				contextChars: fastApplyScope.markdown.length,
				diffChars: merged.diff?.length ?? 0,
				confidence: merged.confidence,
				untouchedBlockMutationCount: 0,
				fallback: scopedReplacementFallback,
			});
			return buildMutationReceipt({
				status: "staged_suggestions",
				ops,
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
			});
		}

		this._editor.apply(ops, { origin: "ai", undoGroup: true });
		this._recordFastApplyDebug({
			attempted: true,
			succeeded: true,
			executionPath: "scoped-replacement",
			contextChars: fastApplyScope.markdown.length,
			diffChars: merged.diff?.length ?? 0,
			confidence: merged.confidence,
			untouchedBlockMutationCount: 0,
			fallback: scopedReplacementFallback,
		});
		return buildMutationReceipt({
			status: "applied",
			ops,
			adapterId: "flow-markdown",
			blockClass: "flow",
			transportKind: "flow-text",
		});
	},

	_resolveMarkdownFastApplyScope(
		this: AIControllerMethodHost,
		blockId: string,
		workingSet: AIWorkingSetEnvelope | null,
	): { markdown: string; blockIds: string[] } | null {
		const context =
			workingSet?.context && typeof workingSet.context === "object"
				? (workingSet.context as {
						markdown?: string | null;
						retrievedSpan?: AIWorkingSetRetrievedSpan | null;
						markdownWindow?: {
							blockIds?: string[];
						} | null;
					})
				: null;
		const markdown = context?.markdown?.trim() ?? "";
		const blockIds = context?.retrievedSpan?.blockIds?.length
			? context.retrievedSpan.blockIds
			: context?.markdownWindow?.blockIds?.length
				? context.markdownWindow.blockIds
				: [blockId];
		if (markdown.length === 0 || blockIds.length === 0) {
			return null;
		}
		return {
			markdown,
			blockIds: [...new Set(blockIds)],
		};
	},

	_buildPlanValidationContext(
		this: AIControllerMethodHost,
		blockId: string,
		scopeBlockIds: readonly string[],
	): PlanValidationContext {
		const knownBlockTypes = this._editor.schema
			.allBlocks()
			.filter((schema) =>
				shouldExposeBlockInTooling(
					this._editor.documentProfile,
					schema,
				),
			)
			.map((schema) => schema.type);
		const editableTargetBlockIds = scopeBlockIds.filter((targetBlockId) => {
			const block = this._editor.getBlock(targetBlockId);
			if (!block) {
				return false;
			}
			const schema = this._editor.schema.resolve(block.type);
			return shouldExposeBlockInTooling(
				this._editor.documentProfile,
				schema,
			);
		});

		return {
			documentProfile: this._editor.documentProfile,
			targetKind: this._resolvePlanValidationTargetKind(blockId),
			knownBlockTypes,
			allowedTargetBlockIds: [...scopeBlockIds],
			editableTargetBlockIds,
		};
	},
};
