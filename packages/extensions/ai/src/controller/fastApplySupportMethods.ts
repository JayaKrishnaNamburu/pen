import type { DocumentOp } from "@input/pen-types";
import { buildDocumentWriteOps } from "@input/pen-document-ops";
import type { AITargetKind } from "../runtime/contracts";
import { normalizeFlowMarkdownOutput } from "../runtime/flowMarkdown";
import { buildMutationReceipt } from "../runtime/mutationReceipt";
import type { AIMutationReceipt, GenerationState } from "../types";
import {
	resolveReplacementDeleteBlockIds,
	shouldReplaceEmptyMarkdownTarget,
} from "../helpers";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";

export const fastApplySupportMethods = {
	_resolvePlanValidationTargetKind(
		this: AIControllerMethodHost,
		blockId: string,
	): AITargetKind {
		const blockType = this._editor.getBlock(blockId)?.type ?? null;
		if (blockType === "table") {
			return "table";
		}
		return "block";
	},

	_verifyMarkdownFastApplyResult(
		this: AIControllerMethodHost,
		blockIds: readonly string[],
		markdown: string,
	): { valid: boolean; reason?: string } {
		if (markdown.trim().length === 0) {
			return { valid: false, reason: "empty-merged-markdown" };
		}
		const startBlockId = blockIds[0];
		const verificationResult = buildDocumentWriteOps(this._editor, {
			format: "markdown",
			content: markdown,
			position: startBlockId ? { before: startBlockId } : undefined,
			surface: "ai-markdown-fast-apply-verify",
		});
		if (verificationResult.blocks.length === 0) {
			return {
				valid: false,
				reason: "markdown-parse-produced-no-blocks",
			};
		}
		return { valid: true };
	},

	_verifyFlowPatchPlanResult(
		this: AIControllerMethodHost,
		plan: {
			edits: Array<{
				locator: { blockId?: string; blockIds?: string[] };
			}>;
		},
		ops: readonly DocumentOp[],
		scopeBlockIds: readonly string[],
	): {
		valid: boolean;
		reason?: string;
		untouchedBlockMutationCount: number;
	} {
		const targetedBlockIds = new Set<string>(
			plan.edits.flatMap((edit) => [
				...(edit.locator.blockId ? [edit.locator.blockId] : []),
				...(edit.locator.blockIds ?? []),
			]),
		);
		const scopeSet = new Set(scopeBlockIds);
		const mutatedExistingBlockIds = new Set<string>();
		const outOfScopeMutations = new Set<string>();
		const createdBlockIds = new Set<string>();

		for (const op of ops) {
			if (op.type === "insert-block") {
				createdBlockIds.add(op.blockId);
			}
			for (const blockId of this._readBlockIdsFromOp(op)) {
				if (scopeSet.has(blockId)) {
					mutatedExistingBlockIds.add(blockId);
				} else if (
					!createdBlockIds.has(blockId) &&
					op.type !== "insert-block"
				) {
					outOfScopeMutations.add(blockId);
				}
			}
		}

		if (outOfScopeMutations.size > 0) {
			return {
				valid: false,
				reason: `flow-patch-mutated-outside-scope:${[...outOfScopeMutations].join(",")}`,
				untouchedBlockMutationCount: 0,
			};
		}

		const untouchedBlockMutationCount = [...mutatedExistingBlockIds].filter(
			(blockId) => !targetedBlockIds.has(blockId),
		).length;
		return {
			valid: untouchedBlockMutationCount === 0,
			reason:
				untouchedBlockMutationCount > 0
					? "flow-patch-mutated-untargeted-blocks"
					: undefined,
			untouchedBlockMutationCount,
		};
	},

	_buildMarkdownScopedReplacementOps(
		this: AIControllerMethodHost,
		blockIds: readonly string[],
		text: string,
	): DocumentOp[] {
		const startBlockId = blockIds[0];
		if (!startBlockId) {
			return [];
		}
		const { ops } = buildDocumentWriteOps(this._editor, {
			format: "markdown",
			content: text,
			position: { before: startBlockId },
			surface: "ai-markdown-fast-apply",
		});
		return [
			...ops,
			...blockIds.map(
				(currentBlockId) =>
					({
						type: "delete-block",
						blockId: currentBlockId,
					}) satisfies DocumentOp,
			),
		];
	},

	_summarizeFastApplyFallbackOps(
		this: AIControllerMethodHost,
		kind: "scoped-replacement" | "plain-markdown",
		ops: readonly DocumentOp[],
		targetBlockCount?: number,
	): {
		kind: "scoped-replacement" | "plain-markdown";
		opsCount: number;
		insertedBlockCount: number;
		deletedBlockCount: number;
		targetBlockCount?: number;
	} {
		let insertedBlockCount = 0;
		let deletedBlockCount = 0;
		for (const op of ops) {
			if (op.type === "insert-block") {
				insertedBlockCount += 1;
			} else if (op.type === "delete-block") {
				deletedBlockCount += 1;
			}
		}
		return {
			kind,
			opsCount: ops.length,
			insertedBlockCount,
			deletedBlockCount,
			targetBlockCount,
		};
	},

	_readBlockIdsFromOp(
		this: AIControllerMethodHost,
		op: DocumentOp,
	): string[] {
		const blockIds = new Set<string>();
		if ("blockId" in op && typeof op.blockId === "string") {
			blockIds.add(op.blockId);
		}
		if ("targetBlockId" in op && typeof op.targetBlockId === "string") {
			blockIds.add(op.targetBlockId);
		}
		if ("sourceBlockId" in op && typeof op.sourceBlockId === "string") {
			blockIds.add(op.sourceBlockId);
		}
		return [...blockIds];
	},

	_recordFastApplyDebug(
		this: AIControllerMethodHost,
		overrides: Partial<
			NonNullable<NonNullable<GenerationState["debug"]>["fastApply"]>
		>,
	): void {
		const activeGeneration = this._state.activeGeneration;
		if (!activeGeneration?.debug) {
			return;
		}
		const currentFastApply = activeGeneration.debug.fastApply ?? {
			attempted: false,
			succeeded: false,
		};
		this._resolveActiveGeneration({
			debug: {
				...activeGeneration.debug,
				fastApply: {
					...currentFastApply,
					...overrides,
				},
			},
		});
	},

	_applySuggestedMarkdownPlaceholderReplacement(
		this: AIControllerMethodHost,
		blockId: string,
		text: string,
		sessionId?: string,
		replaceTargetBlock?: boolean,
		replaceBlockIds?: readonly string[],
	): DocumentOp[] | null {
		const targetBlock = this._editor.getBlock(blockId);
		if (
			!replaceTargetBlock &&
			!shouldReplaceEmptyMarkdownTarget(targetBlock)
		) {
			return null;
		}

		const { ops } = buildDocumentWriteOps(this._editor, {
			format: "markdown",
			content: text,
			position: { before: blockId },
			surface: "ai-markdown",
		});
		if (ops.length === 0) {
			return null;
		}

		const deleteBlockIds = resolveReplacementDeleteBlockIds(
			this._editor,
			blockId,
			replaceBlockIds,
		);
		const replacementOps = [
			...ops,
			...deleteBlockIds.map((nextBlockId) => ({
				type: "delete-block" as const,
				blockId: nextBlockId,
			})),
		] satisfies DocumentOp[];
		this._applySuggestedAIOps(replacementOps, sessionId);
		return replacementOps;
	},

	_refreshStreamingMarkdownBlockPreview(
		this: AIControllerMethodHost,
		blockId: string,
		text: string,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		sessionId: string | undefined,
		baselineSuggestionIds: ReadonlySet<string>,
		previewSuggestionIds: readonly string[],
		previousNormalizedText: string,
		replaceTargetBlock?: boolean,
		replaceBlockIds?: readonly string[],
	): { suggestionIds: string[]; normalizedText: string } {
		const normalizedText = normalizeFlowMarkdownOutput(text);
		if (normalizedText === previousNormalizedText) {
			return {
				suggestionIds: [...previewSuggestionIds],
				normalizedText,
			};
		}

		this._rejectPreviewSuggestions(previewSuggestionIds);

		if (
			normalizedText.trim().length === 0 &&
			!replaceTargetBlock &&
			(replaceBlockIds?.length ?? 0) === 0
		) {
			return {
				suggestionIds: [],
				normalizedText,
			};
		}

		this._commitBufferedBlockGeneration(
			blockId,
			normalizedText,
			mutationMode,
			"markdown",
			sessionId,
			{ replaceTargetBlock, replaceBlockIds },
		);

		return {
			suggestionIds: this.getSuggestions()
				.map((item) => item.id)
				.filter(
					(suggestionId) => !baselineSuggestionIds.has(suggestionId),
				),
			normalizedText,
		};
	},

	_commitStructuredPlan(
		this: AIControllerMethodHost,
		ops: DocumentOp[],
		reviewSafe: boolean,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		adapterId: NonNullable<GenerationState["adapterId"]>,
		blockClass: NonNullable<GenerationState["blockClass"]>,
		transportKind: NonNullable<GenerationState["transportKind"]>,
	): AIMutationReceipt {
		if (ops.length === 0) {
			return buildMutationReceipt({
				status: "noop",
				ops,
				adapterId,
				blockClass,
				transportKind,
			});
		}

		if (mutationMode === "direct-stream") {
			this._editor.apply(ops, { origin: "ai", undoGroup: true });
			return buildMutationReceipt({
				status: "applied",
				ops,
				adapterId,
				blockClass,
				transportKind,
			});
		}

		if (reviewSafe) {
			this._applySuggestedAIOps(ops);
			return buildMutationReceipt({
				status: "staged_suggestions",
				ops,
				adapterId,
				blockClass,
				transportKind,
			});
		}
		return buildMutationReceipt({
			status: "staged_review",
			ops,
			adapterId,
			blockClass,
			transportKind,
		});
	},
};
