import type { OpOrigin, TextSelection } from "@pen/types";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";
import { getOpOriginType } from "@pen/types";
import { resolveDocumentInsertionAnchor } from "../../runtime/documentInsertionAnchor";
import { AI_SESSION_SUGGESTION_ORIGIN } from "../../suggestions/suggestMode";
import type { GenerationState } from "../../types";
import type {
	GenerationExecutionContext,
	GenerationTarget,
} from "../extensionHelpers";
import {
	resolveActiveBlockId,
	resolveBlockInsertionOffset,
} from "../extensionHelpers";

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
					structuredPreview: null,
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

	handleExternalCommit(
		this: AIControllerMethodHost,
		events: readonly {
			origin: OpOrigin;
			affectedBlocks: readonly string[];
		}[],
	): void {
		const active = this._state.activeGeneration;
		if (!active || active.status !== "streaming") return;
		if (
			active.route === "tool-loop" ||
			active.route === "context-first" ||
			active.route === "review"
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
				event.affectedBlocks.includes(active.blockId)
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
};
