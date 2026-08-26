import { AI_EDIT_DOCUMENT_TOOL_NAME } from "../tools/constants";
import type { AgenticStep, AIMutationReceiptStatus } from "../types";

export const EDIT_NOT_APPLIED_REASON =
	"The model produced output but no edit could be applied to the document.";

/**
 * Whether a turn that was asked for a durable edit ended without making one
 * and without saying why (RS3).
 *
 * The old guard keyed on the apply strategy — `markdown-full-replace` reaching
 * `complete` with a `noop` receipt, the signature of a text-parsed plan that
 * failed to compile. UC3 deleted that channel, so it watched nothing.
 *
 * The receipt alone cannot replace it. `_buildFallbackMutationReceipt` reports
 * `applied` only for committed text, and a tool edit applies through
 * `editor.apply` without passing that path, so a successful `edit_document`
 * call and an answer to a question both finish `noop`. What separates them is
 * the tool: a question never calls it (UC8).
 *
 * Silence is the whole subject. A refusal is not a lost edit — it names what
 * was rejected and why (EC5), it is retried inside the turn rather than
 * surfacing as a failed generation (EC10), and that holds for stale targets
 * (EC9) and authority denials (EC13) alike. What this reports is the turn that
 * called the edit tool, landed nothing, and produced no account of either:
 * reporting that as a completed turn is what makes the channel look like it
 * silently ignored the request.
 */
export function isUnappliedEdit(input: {
	/** Evidence this turn was asked for a durable edit. */
	editAttempted: boolean;
	/** Evidence the turn accounted for it — see `editToolAccountedForEdit`. */
	editAccountedFor: boolean;
	receiptStatus: AIMutationReceiptStatus | undefined;
	suggestionCount: number;
}): boolean {
	if (!input.editAttempted || input.editAccountedFor) {
		return false;
	}
	// Staged work is an outcome the host can act on, not a lost edit.
	if (input.suggestionCount > 0) {
		return false;
	}
	return input.receiptStatus === "noop" || input.receiptStatus === "invalid";
}

/** Whether the turn called the edit channel's mutating tool. */
export function calledEditTool(steps: readonly AgenticStep[]): boolean {
	return steps.some(
		(step) =>
			step.type === "tool-call" &&
			step.toolName === AI_EDIT_DOCUMENT_TOOL_NAME,
	);
}

/**
 * Whether the turn's `edit_document` outcome accounts for the edit, either by
 * landing operations or by refusing.
 *
 * A partial apply counts as landed: the user can see and undo what arrived,
 * and the model is told which operations to retry (EC5). A `{ ok: false }`
 * outcome counts as refused — the convention shared by authority denials,
 * stale-target refusals, and semantic rejections — and so does a step that
 * errored, which reaches the model as a journal entry (EC5).
 *
 * Read off any step naming the tool rather than the `tool-result` step alone,
 * because the loop records the two outcomes in different places: a refusal is
 * written back onto the `tool-call` step and the pass continues, while only a
 * call that got past the refusal checks pushes a `tool-result`.
 */
export function editToolAccountedForEdit(
	steps: readonly AgenticStep[],
): boolean {
	return steps.some((step) => {
		if (step.toolName !== AI_EDIT_DOCUMENT_TOOL_NAME) {
			return false;
		}
		if (step.status === "error") {
			return true;
		}
		const output = step.output;
		if (!isEditDocumentToolOutput(output)) {
			return false;
		}
		if (output.ok === false) {
			return true;
		}
		return (
			Array.isArray(output.appliedOperations) &&
			output.appliedOperations.length > 0
		);
	});
}

interface EditDocumentToolOutput {
	ok?: boolean;
	appliedOperations?: unknown;
}

function isEditDocumentToolOutput(
	value: unknown,
): value is EditDocumentToolOutput {
	return value != null && typeof value === "object";
}
