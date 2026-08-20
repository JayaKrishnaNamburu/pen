import { buildDocumentMutationPlanExecution } from "../runtime/planExecutor";
import {
	buildStructuralReviewItems,
	removeStructuralReviewItemPlan,
	selectStructuralReviewItemPlan,
} from "../runtime/reviewArtifacts";
import { buildGenerationStructuredPreviewState } from "../runtime/structuredPreview";
import {
	acceptSuggestions,
	rejectSuggestions,
} from "../suggestions/acceptReject";
import type { GenerationState } from "../types";
import {
	resolveAcceptedInlineSelectionTarget,
	resolveContextualPromptAnchor,
	resolveLiveInlineSelectionTarget,
	resolveOrderedReviewItems,
	resolveSessionAnchor,
	resolveSessionSelectionSnapshot,
	sortReviewItemsForRemoval,
} from "../helpers";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";

export const reviewResolutionMethods = {
	acceptActiveGeneration(this: AIControllerMethodHost): boolean {
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
					structuredPreview: null,
				});
				if (generation.sessionId) {
					if (generation.turnId) {
						this._updateSessionTurn(
							generation.sessionId,
							generation.turnId,
							{
								status: "accepted",
								suggestionIds: [],
								structuredPreview: null,
								anchor: refreshedInlineSelectionTarget
									? resolveSessionAnchor(
											refreshedInlineSelectionTarget.selection,
										)
									: undefined,
								selection: refreshedInlineSelectionTarget
									? resolveSessionSelectionSnapshot(
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
										refreshedInlineSelectionTarget.selection,
									),
									contextualPrompt:
										existingSession?.contextualPrompt
											? {
													...existingSession.contextualPrompt,
													anchor: resolveContextualPromptAnchor(
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

		if (generation.planState !== "validated" || !generation.plan) {
			return false;
		}

		const execution = buildDocumentMutationPlanExecution(
			this._editor,
			generation.plan,
		);
		if (execution.issues.length > 0) {
			this._resolveActiveGeneration({
				planState: "rejected",
			});
			return false;
		}

		this._editor.apply(execution.ops, { origin: "ai", undoGroup: true });
		this._resolveActiveGeneration({
			planState: "none",
			structuredPreview: null,
		});
		if (generation.sessionId) {
			if (generation.turnId) {
				this._updateSessionTurn(
					generation.sessionId,
					generation.turnId,
					{
						status: "accepted",
						reviewItemIds: [],
						structuredPreview: null,
					},
				);
			}
			this._updateSession(generation.sessionId, {
				status: "complete",
				pendingReviewItemIds: [],
			});
		}
		return true;
	},

	rejectActiveGeneration(this: AIControllerMethodHost): boolean {
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
					planState: "rejected",
					structuredPreview: null,
				});
				if (generation.sessionId) {
					if (generation.turnId) {
						this._updateSessionTurn(
							generation.sessionId,
							generation.turnId,
							{
								status: "rejected",
								suggestionIds: [],
								structuredPreview: null,
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

		if (generation.planState === "validated" && generation.plan) {
			this._resolveActiveGeneration({
				status: "cancelled",
				planState: "rejected",
				structuredPreview: null,
			});
			if (generation.sessionId) {
				if (generation.turnId) {
					this._updateSessionTurn(
						generation.sessionId,
						generation.turnId,
						{
							status: "rejected",
							reviewItemIds: [],
							structuredPreview: null,
						},
					);
				}
				this._updateSession(generation.sessionId, {
					status: "complete",
					pendingReviewItemIds: [],
				});
			}
			return true;
		}

		if (generation.status === "streaming") {
			this.cancelActiveGeneration();
		}

		return this._editor.undoManager.undo();
	},

	acceptReviewItem(this: AIControllerMethodHost, id: string): boolean {
		return this.acceptReviewItems([id]);
	},

	rejectReviewItem(this: AIControllerMethodHost, id: string): boolean {
		return this.rejectReviewItems([id]);
	},

	acceptReviewItems(
		this: AIControllerMethodHost,
		ids: readonly string[],
	): boolean {
		return this._applyReviewItems(ids, "accept");
	},

	rejectReviewItems(
		this: AIControllerMethodHost,
		ids: readonly string[],
	): boolean {
		return this._applyReviewItems(ids, "reject");
	},

	_applyReviewItems(
		this: AIControllerMethodHost,
		ids: readonly string[],
		action: "accept" | "reject",
	): boolean {
		const generation = this._state.activeGeneration;
		if (
			!generation ||
			generation.planState !== "validated" ||
			!generation.plan ||
			!generation.reviewItems
		) {
			return false;
		}

		const reviewItems = resolveOrderedReviewItems(
			generation.reviewItems,
			ids,
		);
		if (reviewItems.length === 0) {
			return false;
		}

		if (action === "accept") {
			const selectedPlans = reviewItems.map((reviewItem) =>
				selectStructuralReviewItemPlan(generation.plan!, reviewItem),
			);
			if (selectedPlans.some((plan) => !plan)) {
				return false;
			}
			const resolvedSelectedPlans = selectedPlans.filter(
				(plan): plan is NonNullable<(typeof selectedPlans)[number]> =>
					plan != null,
			);

			const selectedPlan =
				resolvedSelectedPlans.length === 1
					? resolvedSelectedPlans[0]!
					: {
							kind: "review_bundle" as const,
							label: "Bulk review selection",
							reason: "Apply selected review items together.",
							plans: resolvedSelectedPlans,
						};
			const execution = buildDocumentMutationPlanExecution(
				this._editor,
				selectedPlan,
			);
			if (execution.issues.length > 0) {
				return false;
			}

			this._editor.apply(execution.ops, {
				origin: "ai",
				undoGroup: true,
			});
		}

		let nextPlan: GenerationState["plan"] = generation.plan;
		for (const reviewItem of sortReviewItemsForRemoval(reviewItems)) {
			if (!nextPlan) {
				break;
			}
			nextPlan = removeStructuralReviewItemPlan(nextPlan, reviewItem);
		}
		const nextReviewItems = nextPlan
			? buildStructuralReviewItems(this._editor, nextPlan)
			: [];
		this._resolveActiveGeneration({
			status:
				nextPlan || action === "accept"
					? generation.status
					: "cancelled",
			planState: nextPlan
				? "validated"
				: action === "accept"
					? "none"
					: "rejected",
			plan: nextPlan,
			reviewItems: nextReviewItems,
			structuredPreview: nextPlan
				? buildGenerationStructuredPreviewState(this._editor, {
						planState: "validated",
						plan: nextPlan,
					})
				: null,
		});
		if (generation.sessionId) {
			if (generation.turnId) {
				this._updateSessionTurn(
					generation.sessionId,
					generation.turnId,
					{
						status: nextPlan
							? "review"
							: action === "accept"
								? "accepted"
								: "rejected",
						reviewItemIds: nextReviewItems.map((item) => item.id),
					},
				);
			}
			this._updateSession(generation.sessionId, {
				status:
					nextPlan || action === "accept"
						? generation.status === "streaming"
							? "streaming"
							: "complete"
						: "complete",
				pendingReviewItemIds: nextReviewItems.map((item) => item.id),
			});
		}
		return true;
	},
};
