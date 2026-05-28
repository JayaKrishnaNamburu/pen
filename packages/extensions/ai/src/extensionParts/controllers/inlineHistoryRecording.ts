import type { DocumentOp } from "@pen/types";
import type {
	AIControllerState,
	AIInlineHistorySnapshot,
	AISession,
} from "../../types";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";
import { canRegisterExternalInlineTurn } from "../../runtime/externalInlineTurnRegistry";
import {
	AI_UNDO_HISTORY_METADATA_KEY,
	areInlineHistorySnapshotsEqual,
	createInlineHistorySnapshot,
	didInlineHistoryCheckpointChange,
} from "../extensionHelpers";

export const inlineHistoryRecording = {
	registerExternalInlineTurnResult(
		this: AIControllerMethodHost,
		input: {
			sessionId: string;
			turnId: string;
			historyId: string;
			operations: readonly DocumentOp[];
			suggestionIds: readonly string[];
		},
	): boolean {
		if (
			!canRegisterExternalInlineTurn(
				input,
				this._externalInlineTurnRegistry,
			)
		) {
			return false;
		}

		const session =
			this._state.sessions.find((item) => item.id === input.sessionId) ??
			null;
		const turn =
			session?.turns.find((item) => item.id === input.turnId) ?? null;
		if (!session || !turn) {
			return false;
		}

		const nextHistory = this._inlineHistory.slice(
			0,
			this._inlineHistoryIndex + 1,
		);
		const fullCurrentSnapshot = createInlineHistorySnapshot(
			this._editor,
			this._state.sessions,
			this._state.activeSessionId ?? input.sessionId,
			this._documentVersion,
			{ kind: "document-coupled" },
		);
		const currentSnapshot = nextHistory[nextHistory.length - 1] ?? null;
		const currentSnapshotIsFull =
			currentSnapshot &&
			areInlineHistorySnapshotsEqual(currentSnapshot, fullCurrentSnapshot);
		const retainedCurrentSnapshot = currentSnapshotIsFull
			? currentSnapshot
			: null;
		const workingHistory = retainedCurrentSnapshot
			? nextHistory.slice(0, -1)
			: nextHistory;
		const beforeSnapshot = createInlineHistorySnapshot(
			this._editor,
			this._createExternalInlineTurnHistorySessions(
				input.sessionId,
				input.turnId,
				false,
			),
			input.sessionId,
			this._documentVersion,
			{ kind: "document-coupled" },
		);
		const beforePreviousSnapshot =
			workingHistory[workingHistory.length - 1] ?? null;
		if (
			!beforePreviousSnapshot ||
			beforePreviousSnapshot.kind === "ui-local" ||
			!areInlineHistorySnapshotsEqual(
				beforePreviousSnapshot,
				beforeSnapshot,
			)
		) {
			workingHistory.push(beforeSnapshot);
		}

		const afterSnapshot = createInlineHistorySnapshot(
			this._editor,
			this._createExternalInlineTurnHistorySessions(
				input.sessionId,
				input.turnId,
				true,
			),
			input.sessionId,
			this._documentVersion,
			{ kind: "document-coupled" },
		);
		const lastSnapshot = workingHistory[workingHistory.length - 1] ?? null;
		const registeredAfterSnapshot =
			lastSnapshot &&
			areInlineHistorySnapshotsEqual(lastSnapshot, afterSnapshot)
				? lastSnapshot
				: afterSnapshot;
		if (registeredAfterSnapshot === afterSnapshot) {
			workingHistory.push(afterSnapshot);
		}
		if (
			retainedCurrentSnapshot &&
			!areInlineHistorySnapshotsEqual(
				workingHistory[workingHistory.length - 1]!,
				retainedCurrentSnapshot,
			)
		) {
			workingHistory.push(retainedCurrentSnapshot);
		}

		this._inlineHistory = workingHistory;
		this._inlineHistoryIndex = workingHistory.length - 1;
		this._externalInlineTurnRegistry.set(input.historyId, {
			...input,
			operations: [...input.operations],
			suggestionIds: [...input.suggestionIds],
			beforeSnapshotId: beforeSnapshot.id,
			afterSnapshotId: registeredAfterSnapshot.id,
		});
		return true;
	},

	_createExternalInlineTurnHistorySessions(
		this: AIControllerMethodHost,
		sessionId: string,
		turnId: string,
		includeTurn: boolean,
	): readonly AISession[] {
		return this._state.sessions.map((session) => {
			if (session.id !== sessionId || session.surface !== "inline-edit") {
				return session;
			}
			const turn =
				session.turns.find((item) => item.id === turnId) ?? null;
			if (!turn) {
				return session;
			}
			const turnIndex = session.turns.findIndex(
				(item) => item.id === turnId,
			);
			const nextTurns = session.turns
				.slice(0, includeTurn ? turnIndex + 1 : turnIndex)
				.map((item) => {
					const hasExternalResult =
						item.id === turnId ||
						this._externalInlineTurnRegistry.turnHasExternalResult(
							sessionId,
							item.id,
						);
					if (!hasExternalResult || item.status !== "cancelled") {
						return item;
					}
					return {
						...item,
						status: "review" as const,
					};
				});
			const nextPendingSuggestionIds = [
				...new Set(nextTurns.flatMap((item) => item.suggestionIds)),
			];
			const nextPendingReviewItemIds = [
				...new Set(nextTurns.flatMap((item) => item.reviewItemIds)),
			];
			const previousTurn = nextTurns[nextTurns.length - 1] ?? null;
			return {
				...session,
				status: previousTurn ? session.status : "idle",
				turns: nextTurns,
				activeTurnId: previousTurn?.id,
				pendingSuggestionIds: nextPendingSuggestionIds,
				pendingReviewItemIds: nextPendingReviewItemIds,
				contextualPrompt: session.contextualPrompt
					? {
							...session.contextualPrompt,
							composer: {
								...session.contextualPrompt.composer,
								draftPrompt: turn.prompt,
								isOpen: true,
								isSubmitting: false,
							},
						}
					: session.contextualPrompt,
			};
		});
	},

	_recordInlineHistorySnapshot(
		this: AIControllerMethodHost,
		previousState: AIControllerState,
		nextState: AIControllerState,
	): void {
		if (!didInlineHistoryCheckpointChange(previousState, nextState)) {
			return;
		}
		if (
			previousState.sessions === nextState.sessions &&
			previousState.activeSessionId === nextState.activeSessionId
		) {
			return;
		}
		const currentSnapshot = this._inlineHistory[this._inlineHistoryIndex];
		const nextHistory = this._inlineHistory.slice(
			0,
			this._inlineHistoryIndex + 1,
		);
		if (nextHistory.length === 0) {
			const baselineSnapshot = createInlineHistorySnapshot(
				this._editor,
				previousState.sessions,
				previousState.activeSessionId ?? null,
				this._documentVersion,
			);
			nextHistory.push(baselineSnapshot);
		}
		const previousSnapshot =
			nextHistory[nextHistory.length - 1] ?? currentSnapshot ?? null;
		const snapshot = createInlineHistorySnapshot(
			this._editor,
			nextState.sessions,
			nextState.activeSessionId ?? null,
			this._documentVersion,
			{
				kind:
					previousSnapshot?.documentVersion === this._documentVersion
						? "ui-local"
						: "document-coupled",
			},
		);
		if (
			currentSnapshot &&
			areInlineHistorySnapshotsEqual(currentSnapshot, snapshot)
		) {
			return;
		}
		const currentUndoMetadata =
			this._undoHistoryMetadata?.getCurrentEntryMetadata<AIInlineHistorySnapshot>(
				AI_UNDO_HISTORY_METADATA_KEY,
			) ?? null;
		const shouldPersistUndoSnapshot =
			previousSnapshot != null &&
			(snapshot.kind === "document-coupled" ||
				currentUndoMetadata?.after?.documentVersion ===
					this._documentVersion);
		if (shouldPersistUndoSnapshot && previousSnapshot) {
			this._undoHistoryMetadata?.setCurrentEntryMetadata(
				AI_UNDO_HISTORY_METADATA_KEY,
				{
					before: currentUndoMetadata?.before ?? previousSnapshot,
					after: snapshot,
				},
			);
		}
		nextHistory.push(snapshot);
		this._inlineHistory = nextHistory;
		this._inlineHistoryIndex = nextHistory.length - 1;
	},

	_recordInlinePromptSubmissionCheckpoint(
		this: AIControllerMethodHost,
		sessionId: string,
		prompt: string,
	): void {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		if (
			!session ||
			session.surface !== "inline-edit" ||
			!session.contextualPrompt
		) {
			return;
		}
		const checkpointState: AIControllerState = {
			...this._state,
			activeSessionId: sessionId,
			sessions: this._state.sessions.map((item) =>
				item.id !== sessionId
					? item
					: {
							...item,
							contextualPrompt: {
								...item.contextualPrompt!,
								composer: {
									...item.contextualPrompt!.composer,
									draftPrompt: prompt,
									isOpen: true,
									isSubmitting: false,
								},
							},
						},
			),
		};
		const snapshot = createInlineHistorySnapshot(
			this._editor,
			checkpointState.sessions,
			checkpointState.activeSessionId ?? null,
			this._documentVersion,
			{ kind: "ui-local" },
		);
		const currentSnapshot = this._inlineHistory[this._inlineHistoryIndex];
		if (
			currentSnapshot &&
			areInlineHistorySnapshotsEqual(currentSnapshot, snapshot)
		) {
			return;
		}
		const nextHistory = this._inlineHistory.slice(
			0,
			this._inlineHistoryIndex + 1,
		);
		nextHistory.push(snapshot);
		this._inlineHistory = nextHistory;
		this._inlineHistoryIndex = nextHistory.length - 1;
	},
};
