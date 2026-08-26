import type { DocumentOp } from "@input/pen-types";
import { buildDocumentWriteOps } from "@input/pen-document-ops";
import { buildMutationReceipt } from "../runtime/mutationReceipt";
import type { AIMutationReceipt, GenerationState } from "../types";
import {
	resolveReplacementDeleteBlockIds,
	shouldReplaceEmptyMarkdownTarget,
} from "../helpers";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";

export const fastApplySupportMethods = {
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
