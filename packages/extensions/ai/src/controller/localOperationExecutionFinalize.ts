import { buildMutationReceipt } from "../runtime/mutationReceipt";
import type { GenerationState } from "../types";
import type { AIControllerImpl } from "./aiController";
import { createAIStreamEvent } from "../helpers";
import type { LocalOperationExecutionState } from "./generationExecutionState";
import { EDIT_NOT_APPLIED_REASON, isUnappliedEdit } from "./unappliedEdit";

export function finalizeLocalOperationExecution(
	controller: AIControllerImpl,
	state: LocalOperationExecutionState,
): GenerationState {
	const {
		context,
		sessionTurnId,
		operation,
		currentText,
		currentMutationReceipt,
		seedGeneration,
		abortController,
		baselineSuggestionIds,
	} = state;
	const suggestionIds = controller
		.getSuggestions()
		.map((item) => item.id)
		.filter((id) => !baselineSuggestionIds.has(id));
	const mutationReceipt =
		currentMutationReceipt ??
		buildMutationReceipt({
			status: "noop",
		});
	/*
	 * The host asked for a specific operation, so an edit was always
	 * attempted on this path — there is no question to mistake it for.
	 * No tool runs here; the receipt carries the whole outcome (RS3).
	 */
	const unappliedEdit =
		!abortController.signal.aborted &&
		isUnappliedEdit({
			editAttempted: true,
			editAccountedFor: false,
			receiptStatus: mutationReceipt.status,
			suggestionCount: suggestionIds.length,
		});
	const finalStatus = abortController.signal.aborted
		? "cancelled"
		: unappliedEdit
			? "error"
			: "complete";
	const finalGeneration: GenerationState = {
		...seedGeneration,
		text: currentText,
		status: finalStatus,
		turnReason: unappliedEdit
			? EDIT_NOT_APPLIED_REASON
			: seedGeneration.turnReason,
		suggestionIds,
		mutationReceipt,
	};
	controller._setState({
		status: "idle",
		activeGeneration: finalGeneration,
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
				status: finalStatus === "cancelled" ? "cancelled" : "complete",
				suggestionIds,
				generatedBlockIds: localGeneratedBlockIds,
			});
		}
		controller._updateSession(context.sessionId, {
			status: finalStatus === "cancelled" ? "cancelled" : "complete",
			pendingSuggestionIds: suggestionIds,
		});
	}
	return finalGeneration;
}
