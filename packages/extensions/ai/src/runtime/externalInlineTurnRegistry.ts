import type { DocumentOp } from "@pen/types";
import type {
	AIExternalInlineTurnResult,
	AIInlineHistoryDirection,
	AIInlineHistorySnapshot,
} from "../types";

export interface StoredExternalInlineTurnResult extends AIExternalInlineTurnResult {
	beforeSnapshotId?: string;
	afterSnapshotId?: string;
}

export class ExternalInlineTurnRegistry {
	private readonly results = new Map<string, StoredExternalInlineTurnResult>();

	has(historyId: string): boolean {
		return this.results.has(historyId);
	}

	get(historyId: string): StoredExternalInlineTurnResult | undefined {
		return this.results.get(historyId);
	}

	set(
		historyId: string,
		result: StoredExternalInlineTurnResult,
	): void {
		this.results.set(historyId, result);
	}

	values(): StoredExternalInlineTurnResult[] {
		return [...this.results.values()];
	}

	resolveTransition(
		currentSnapshot: AIInlineHistorySnapshot | null,
		targetSnapshot: AIInlineHistorySnapshot,
		direction: AIInlineHistoryDirection,
		snapshotHasTurn: (
			snapshot: AIInlineHistorySnapshot,
			sessionId: string,
			turnId: string,
		) => boolean,
	): StoredExternalInlineTurnResult | null {
		if (!currentSnapshot) {
			return null;
		}

		const results = [...this.results.values()].reverse();
		for (const result of results) {
			const currentHasTurn = snapshotHasTurn(
				currentSnapshot,
				result.sessionId,
				result.turnId,
			);
			const targetHasTurn = snapshotHasTurn(
				targetSnapshot,
				result.sessionId,
				result.turnId,
			);
			if (
				direction === "undo" &&
				((result.afterSnapshotId === currentSnapshot.id &&
					result.beforeSnapshotId === targetSnapshot.id) ||
					(currentHasTurn && !targetHasTurn))
			) {
				return result;
			}
			if (
				direction === "redo" &&
				((result.beforeSnapshotId === currentSnapshot.id &&
					result.afterSnapshotId === targetSnapshot.id) ||
					(!currentHasTurn && targetHasTurn))
			) {
				return result;
			}
		}

		return null;
	}

	turnHasExternalResult(sessionId: string, turnId: string): boolean {
		return this.values().some(
			(result) => result.sessionId === sessionId && result.turnId === turnId,
		);
	}
}

export type RegisterExternalInlineTurnInput = {
	sessionId: string;
	turnId: string;
	historyId: string;
	operations: readonly DocumentOp[];
	suggestionIds: readonly string[];
};

export function canRegisterExternalInlineTurn(
	input: RegisterExternalInlineTurnInput,
	registry: ExternalInlineTurnRegistry,
): boolean {
	return (
		Boolean(input.historyId) &&
		input.operations.length > 0 &&
		input.suggestionIds.length > 0 &&
		!registry.has(input.historyId)
	);
}
