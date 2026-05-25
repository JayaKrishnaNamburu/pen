// @ts-nocheck
import * as deps from "./controllerDeps";
const { buildMutationReceipt, createAIStreamEvent } = deps;

export function finalizeLocalOperationExecution(controller: any, state: any): any {
	const { context, sessionTurnId, operation, currentText, currentMutationReceipt, seedGeneration, abortController, baselineSuggestionIds } = state;
			const suggestionIds = controller.getSuggestions()
				.map((item) => item.id)
				.filter((id) => !baselineSuggestionIds.has(id));
			const mutationReceipt =
				currentMutationReceipt ??
				buildMutationReceipt({
					status: currentText.length > 0 ? "noop" : "noop",
					adapterId: "flow-markdown",
					blockClass: "flow",
					transportKind: "flow-text",
				});
			const finalStatus = abortController.signal.aborted
				? "cancelled"
				: "complete";
			controller._setState({
				status: "idle",
				activeGeneration: {
					...seedGeneration,
					text: currentText,
					status: finalStatus,
					suggestionIds,
					mutationReceipt,
				},
			});
			controller._appendStreamEvent(
				createAIStreamEvent(seedGeneration, {
					type: "generation-finish",
					status: finalStatus,
					text: currentText,
				}),
			);
			if (context?.sessionId) {
				if (sessionTurnId) {
					const localReceiptEvidence = mutationReceipt?.evidence;
					const localGeneratedBlockIds = localReceiptEvidence
						? [
								...new Set([
									...localReceiptEvidence.affectedBlockIds,
									...localReceiptEvidence.createdBlockIds,
								]),
							]
						: operation.kind === "rewrite-selection" &&
							  operation.target.kind === "scoped-range"
							? [...operation.target.blockIds]
							: [];
					controller._updateSessionTurn(context.sessionId, sessionTurnId, {
						status:
							finalStatus === "cancelled"
								? "cancelled"
								: "complete",
						suggestionIds,
						generatedBlockIds: localGeneratedBlockIds,
					});
				}
				controller._updateSession(context.sessionId, {
					status:
						finalStatus === "cancelled" ? "cancelled" : "complete",
					pendingSuggestionIds: suggestionIds,
					pendingReviewItemIds: [],
				});
			}
			return {
				...seedGeneration,
				text: currentText,
				status: finalStatus,
				suggestionIds,
				mutationReceipt,
			};
}
