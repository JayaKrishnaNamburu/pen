import type { Editor } from "@input/pen-types";
import { UNDO_HISTORY_RESTORE_SLOT_KEY } from "@input/pen-types";

export const HISTORY_RESTORING_SELECTION_SLOT_KEY =
	UNDO_HISTORY_RESTORE_SLOT_KEY;

/**
 * Tracks a deferred projection request id across history restore so the
 * projector can complete or cancel that request. Selection sync suppression
 * lived here and is gone — P1-after-undo plus mount ack own that window.
 */
export class HistorySelectionCoordinator {
	private pendingProjectionRequestId: number | null = null;

	constructor(_editor: Pick<Editor, "facet">) {}

	beginDeferredProjection(requestId: number): void {
		this.pendingProjectionRequestId = requestId;
	}

	getPendingProjectionRequestId(): number | null {
		return this.pendingProjectionRequestId;
	}

	completeDeferredProjection(requestId: number | null): void {
		if (requestId === null) return;
		if (this.pendingProjectionRequestId !== requestId) return;
		this.pendingProjectionRequestId = null;
	}

	cancelDeferredProjection(): void {
		this.pendingProjectionRequestId = null;
	}

	reset(): void {
		this.pendingProjectionRequestId = null;
	}
}
