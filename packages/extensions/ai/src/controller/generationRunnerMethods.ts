import { affectedBlockIdsFromSummary } from "@input/pen-core";
import type { CommitEvent, TextSelection } from "@input/pen-types";
import { getOpOriginType } from "@input/pen-core";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";
import { executeGeneration } from "./generationExecution";
import { executeLocalOperation } from "./localOperationExecution";
import { resolveDocumentInsertionAnchor } from "../runtime/documentInsertionAnchor";
import { AI_SESSION_SUGGESTION_ORIGIN } from "../suggestions/suggestMode";
import {
	isAIMutationPreference,
	type AIMutationPreference,
} from "../runtime/contracts";
import type { AIRequestedOperation, GenerationState } from "../types";
import type {
	GenerationExecutionContext,
	GenerationTarget,
} from "../helpers";
import {
	resolveActiveBlockId,
	resolveBlockInsertionOffset,
} from "../helpers";

export const generationRunnerMethods = {
	cancelActiveGeneration(this: AIControllerMethodHost): void {
		this._abortController?.abort();
		this._abortController = null;
		if (this._state.activeGeneration) {
			const sessionId = this._state.activeGeneration.sessionId;
			this._setState({
				status: "idle",
				activeGeneration: {
					...this._state.activeGeneration,
					status: "cancelled",
				},
			});
			if (sessionId) {
				if (this._state.activeGeneration.turnId) {
					this._updateSessionTurn(
						sessionId,
						this._state.activeGeneration.turnId,
						{ status: "cancelled" },
					);
				}
				this._updateSession(sessionId, {
					status: "cancelled",
				});
				this.clearStreamingReviewPreview(sessionId);
			}
		}
		this._inlineCompletion.dismissSuggestion();
	},

	openCommandMenu(this: AIControllerMethodHost): void {
		this._setState({ commandMenuOpen: true });
	},

	closeCommandMenu(this: AIControllerMethodHost): void {
		this._setState({ commandMenuOpen: false });
	},

	setSuggestMode(this: AIControllerMethodHost, enabled: boolean): void {
		this._setState({ suggestMode: enabled });
	},

	setMutationPreference(
		this: AIControllerMethodHost,
		preference: AIMutationPreference,
	): void {
		if (!isAIMutationPreference(preference)) {
			this._editor.internals.emit("diagnostic", {
				level: "warn",
				source: "ai",
				code: "AI_MUTATION_PREFERENCE_INVALID",
				message: `Unknown mutation preference: ${String(preference)}`,
			});
			return;
		}
		this._mutationPreference = preference;
		this._setState({ mutationPreference: preference });
	},

	handleExternalCommit(
		this: AIControllerMethodHost,
		events: readonly CommitEvent[],
	): void {
		const active = this._state.activeGeneration;
		if (!active || active.status !== "streaming") return;
		if (
			active.route !== "selection-rewrite" &&
			active.route !== "cursor-context"
		) {
			return;
		}
		const touched = events.some((event) => {
			const originType = getOpOriginType(event.origin);
			return (
				originType !== "ai" &&
				originType !== AI_SESSION_SUGGESTION_ORIGIN &&
				originType !== "system" &&
				originType !== "extension" &&
				affectedBlockIdsFromSummary(event.summary).includes(
					active.blockId,
				)
			);
		});
		if (!touched) return;
		this.cancelActiveGeneration();
	},

	async _runBlockGeneration(
		this: AIControllerMethodHost,
		prompt: string,
		blockId: string,
		commandId?: string,
		maxSteps?: number,
		context?: GenerationExecutionContext,
	): Promise<GenerationState> {
		const block = this._editor.getBlock(blockId);
		if (!block) {
			throw new Error(`Block "${blockId}" not found`);
		}

		const target: GenerationTarget = {
			type: "block",
			blockId,
			offset: resolveBlockInsertionOffset(this._editor, blockId),
		};
		return this._executeGeneration(
			prompt,
			target,
			commandId,
			maxSteps,
			context,
		);
	},

	async _runDocumentGeneration(
		this: AIControllerMethodHost,
		prompt: string,
		preferredBlockId?: string | null,
		commandId?: string,
		maxSteps?: number,
		context?: GenerationExecutionContext,
	): Promise<GenerationState> {
		const documentTarget =
			context?.operation?.target.kind === "document"
				? context.operation.target
				: null;
		const replaceBlockIds =
			documentTarget?.blockIds && documentTarget.blockIds.length > 0
				? [...documentTarget.blockIds]
				: context?.replaceBlockIds;
		const insertionAnchor = resolveDocumentInsertionAnchor(this._editor, {
			preferredBlockId:
				documentTarget?.activeBlockId ??
				documentTarget?.blockIds?.[0] ??
				preferredBlockId ??
				resolveActiveBlockId(this._editor.selection) ??
				null,
		});
		if (!insertionAnchor) {
			throw new Error(
				"Cannot run an AI document prompt without an insertion anchor",
			);
		}

		return this._runBlockGeneration(
			prompt,
			insertionAnchor.blockId,
			commandId,
			maxSteps,
			{
				...context,
				scope: context?.scope ?? "document",
				replaceTargetBlock:
					documentTarget?.placement === "replace-blocks" ||
					documentTarget?.placement === "replace-empty-block" ||
					insertionAnchor.strategy === "replace-empty-block" ||
					(replaceBlockIds?.length ?? 0) > 0,
				replaceBlockIds,
			},
		);
	},

	async _runSelectionGeneration(
		this: AIControllerMethodHost,
		prompt: string,
		selection: TextSelection,
		commandId?: string,
		maxSteps?: number,
		context?: GenerationExecutionContext,
	): Promise<GenerationState> {
		return this._executeGeneration(
			prompt,
			{ type: "selection", selection },
			commandId,
			maxSteps,
			context,
		);
	},

	async _executeGeneration(
		this: AIControllerMethodHost,
		prompt: string,
		target: GenerationTarget,
		commandId?: string,
		maxSteps?: number,
		context?: GenerationExecutionContext,
	): Promise<GenerationState> {
		return executeGeneration(this, {
			prompt,
			target,
			commandId,
			maxSteps,
			context,
		});
	},

	async _executeLocalOperation(
		this: AIControllerMethodHost,
		input: {
			prompt: string;
			target: GenerationTarget;
			blockId: string;
			commandId?: string;
			context?: GenerationExecutionContext;
			abortController: AbortController;
			baselineSuggestionIds: Set<string>;
			operation: AIRequestedOperation;
		},
	): Promise<GenerationState> {
		return executeLocalOperation(this, input);
	},
};
