import {
	acceptSuggestions,
	rejectSuggestions,
} from "../suggestions/acceptReject";
import {
	resolveAcceptedInlineSelectionTarget,
	resolveContextualPromptAnchor,
	resolveLiveInlineSelectionTarget,
	resolveSessionAnchor,
	resolveSessionSelectionSnapshot,
} from "../helpers";
import type { AIControllerImpl } from "./aiController";

export const reviewResolutionMethods = {
	acceptActiveGeneration(this: AIControllerImpl): boolean {
		const generation = this._state.activeGeneration;
		if (!generation) {
			return false;
		}

		if (generation.suggestionIds && generation.suggestionIds.length > 0) {
			const existingSession =
				generation.sessionId != null
					? (this._state.sessions.find(
							(session) => session.id === generation.sessionId,
						) ?? null)
					: null;
			const existingTurn =
				generation.turnId != null
					? (existingSession?.turns.find(
							(turn) => turn.id === generation.turnId,
						) ?? null)
					: null;
			const refreshSuggestionIds = existingTurn?.suggestionIds.length
				? existingTurn.suggestionIds
				: generation.suggestionIds;
			const refreshedInlineSelectionTarget =
				generation.surface === "inline-edit"
					? (resolveAcceptedInlineSelectionTarget(
							this._editor,
							existingTurn?.operation ??
								generation.operation ??
								undefined,
							refreshSuggestionIds,
						) ?? resolveLiveInlineSelectionTarget(this._editor))
					: null;
			const accepted = acceptSuggestions(
				this._editor,
				generation.suggestionIds,
			);
			if (accepted) {
				this._resolveActiveGeneration({
					suggestionIds: [],
				});
				if (generation.sessionId) {
					if (generation.turnId) {
						this._updateSessionTurn(
							generation.sessionId,
							generation.turnId,
							{
								status: "accepted",
								suggestionIds: [],
								anchor: refreshedInlineSelectionTarget
									? resolveSessionAnchor(
											this._editor,
											refreshedInlineSelectionTarget.selection,
										)
									: undefined,
								selection: refreshedInlineSelectionTarget
									? resolveSessionSelectionSnapshot(
											this._editor,
											refreshedInlineSelectionTarget.selection,
										)
									: undefined,
							},
						);
					}
					this._updateSession(generation.sessionId, {
						status: "complete",
						pendingSuggestionIds: [],
						...(refreshedInlineSelectionTarget
							? {
									target: refreshedInlineSelectionTarget,
									anchor: resolveSessionAnchor(
										this._editor,
										refreshedInlineSelectionTarget.selection,
									),
									contextualPrompt:
										existingSession?.contextualPrompt
											? {
													...existingSession.contextualPrompt,
													anchor: resolveContextualPromptAnchor(
														this._editor,
														refreshedInlineSelectionTarget,
													),
												}
											: undefined,
								}
							: {}),
					});
				}
			}
			return accepted;
		}

		return false;
	},

	rejectActiveGeneration(this: AIControllerImpl): boolean {
		const generation = this._state.activeGeneration;
		if (!generation) return false;

		if (generation.suggestionIds && generation.suggestionIds.length > 0) {
			const rejected = rejectSuggestions(
				this._editor,
				generation.suggestionIds,
			);
			if (rejected) {
				this._resolveActiveGeneration({
					suggestionIds: [],
				});
				if (generation.sessionId) {
					if (generation.turnId) {
						this._updateSessionTurn(
							generation.sessionId,
							generation.turnId,
							{
								status: "rejected",
								suggestionIds: [],
							},
						);
					}
					this._updateSession(generation.sessionId, {
						status: "complete",
						pendingSuggestionIds: [],
					});
				}
			}
			return rejected;
		}

		if (generation.status === "streaming") {
			this.cancelActiveGeneration();
		}

		return this._editor.undoManager.undo();
	},
};
