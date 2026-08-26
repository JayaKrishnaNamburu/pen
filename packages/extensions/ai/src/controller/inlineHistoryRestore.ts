import { isCollapsed } from "@input/pen-core";
import type { HistoryAppliedEvent } from "@input/pen-types";
import type {
	AIInlineHistoryDirection,
	AIInlineHistorySnapshot,
	AISession,
} from "../types";
import type { AIControllerImpl } from "./aiController";
import type { AIInlineHistoryRestoreRequest } from "../helpers";
import {
	areInlineShortcutHistoryStatesEqual,
	createInlineHistorySnapshot,
	resolveInlineShortcutHistoryState,
	sessionSelectionMatches,
	shouldReplaceInlineShortcutWaypointRepresentative,
} from "../helpers";

export const inlineHistoryRestore = {
	_findInlineHistorySnapshotForResolvedTurn(
		this: AIControllerImpl,
		session: AISession,
		direction: AIInlineHistoryDirection,
	): AIInlineHistorySnapshot | null {
		const latestTurnId =
			session.turns[session.turns.length - 1]?.id ?? null;
		if (!latestTurnId) {
			return null;
		}
		for (
			let index = this._inlineHistory.length - 1;
			index >= 0;
			index -= 1
		) {
			const snapshot = this._inlineHistory[index];
			const snapshotSession =
				snapshot?.sessions.find(
					(item) =>
						item.id === session.id &&
						item.surface === "inline-edit",
				) ?? null;
			if (!snapshotSession) {
				continue;
			}
			const snapshotTurn =
				snapshotSession.turns.find(
					(turn) => turn.id === latestTurnId,
				) ?? null;
			if (!snapshotTurn) {
				continue;
			}
			if (
				direction === "undo" &&
				snapshotSession.contextualPrompt?.composer.isOpen &&
				snapshotTurn.status === "review"
			) {
				return snapshot;
			}
			if (
				direction === "redo" &&
				!snapshotSession.contextualPrompt?.composer.isOpen &&
				(snapshotTurn.status === "accepted" ||
					snapshotTurn.status === "rejected")
			) {
				return snapshot;
			}
		}
		return null;
	},

	_resolveInlineHistoryTraversalSnapshot(
		this: AIControllerImpl,
		targetSnapshot: AIInlineHistorySnapshot,
	): AIInlineHistorySnapshot {
		if (targetSnapshot.kind === "ui-local") {
			return targetSnapshot;
		}
		const scopedSessionId =
			targetSnapshot.sessionId ?? targetSnapshot.activeSessionId;
		const targetState = resolveInlineShortcutHistoryState(
			targetSnapshot,
			scopedSessionId,
		);
		if (!targetState) {
			return targetSnapshot;
		}
		let resolvedSnapshot = targetSnapshot;
		for (const snapshot of this._inlineHistory) {
			if (snapshot.documentVersion !== targetSnapshot.documentVersion) {
				continue;
			}
			const snapshotState = resolveInlineShortcutHistoryState(
				snapshot,
				scopedSessionId,
			);
			if (
				!snapshotState ||
				!areInlineShortcutHistoryStatesEqual(snapshotState, targetState)
			) {
				continue;
			}
			if (
				shouldReplaceInlineShortcutWaypointRepresentative(
					targetState,
					resolvedSnapshot,
					snapshot,
				)
			) {
				resolvedSnapshot = snapshot;
			}
		}
		return resolvedSnapshot;
	},

	_resolveShortcutInlineHistoryTraversalSnapshot(
		this: AIControllerImpl,
		targetSnapshot: AIInlineHistorySnapshot,
		fallbackSessionId?: string | null,
	): AIInlineHistorySnapshot {
		const scopedSessionId =
			targetSnapshot.sessionId ??
			targetSnapshot.activeSessionId ??
			fallbackSessionId ??
			null;
		const targetState = resolveInlineShortcutHistoryState(
			targetSnapshot,
			scopedSessionId,
		);
		if (targetState?.phase !== "none" || !scopedSessionId) {
			return this._resolveInlineHistoryTraversalSnapshot(targetSnapshot);
		}
		return createInlineHistorySnapshot(
			this._editor,
			targetSnapshot.sessions.filter(
				(session) => session.id !== scopedSessionId,
			),
			targetSnapshot.activeSessionId === scopedSessionId
				? null
				: targetSnapshot.activeSessionId,
			targetSnapshot.documentVersion,
			{ kind: targetSnapshot.kind },
		);
	},

	_scheduleQueuedInlineHistoryShortcutFlush(
		this: AIControllerImpl,
	): void {
		if (
			this._queuedInlineHistoryShortcutFlushScheduled ||
			this._queuedInlineHistoryShortcutDirections.length === 0
		) {
			return;
		}
		this._queuedInlineHistoryShortcutFlushScheduled = true;
		queueMicrotask(() => {
			this._queuedInlineHistoryShortcutFlushScheduled = false;
			if (this._pendingInlineHistoryRestore) {
				this._scheduleQueuedInlineHistoryShortcutFlush();
				return;
			}
			const nextDirection =
				this._queuedInlineHistoryShortcutDirections.shift() ?? null;
			if (!nextDirection) {
				return;
			}
			this._navigateInlineHistory(nextDirection, { shortcutOnly: true });
			if (this._queuedInlineHistoryShortcutDirections.length > 0) {
				this._scheduleQueuedInlineHistoryShortcutFlush();
			}
		});
	},

	_resolvePendingInlineHistoryRestoreTargetIndex(
		this: AIControllerImpl,
		request: AIInlineHistoryRestoreRequest,
	): number {
		const exactTargetIndex = this._inlineHistory.findIndex(
			(snapshot) => snapshot.id === request.targetSnapshotId,
		);
		if (exactTargetIndex >= 0) {
			return exactTargetIndex;
		}
		if (!request.targetState) {
			return -1;
		}
		let resolvedTargetIndex = -1;
		const scopedSessionId =
			request.sessionId ?? request.targetState.sessionId;
		for (let index = 0; index < this._inlineHistory.length; index += 1) {
			const snapshot = this._inlineHistory[index];
			if (!snapshot || snapshot.kind === "ui-local") {
				continue;
			}
			if (snapshot.documentVersion !== request.targetDocumentVersion) {
				continue;
			}
			const snapshotState = resolveInlineShortcutHistoryState(
				snapshot,
				scopedSessionId ?? null,
			);
			if (
				!snapshotState ||
				!areInlineShortcutHistoryStatesEqual(
					snapshotState,
					request.targetState,
				)
			) {
				continue;
			}
			if (
				resolvedTargetIndex < 0 ||
				shouldReplaceInlineShortcutWaypointRepresentative(
					request.targetState,
					this._inlineHistory[resolvedTargetIndex] ?? null,
					snapshot,
				)
			) {
				resolvedTargetIndex = index;
			}
		}
		return resolvedTargetIndex;
	},

	_handleHistoryApplied(
		this: AIControllerImpl,
		event: HistoryAppliedEvent,
	): void {
		if (
			this._pendingInlineHistoryRestore &&
			this._pendingInlineHistoryRestore.direction === event.kind
		) {
			const targetIndex =
				this._resolvePendingInlineHistoryRestoreTargetIndex(
					this._pendingInlineHistoryRestore,
				);
			if (targetIndex >= 0) {
				this._inlineHistoryIndex = targetIndex;
				const targetSnapshot = this._inlineHistory[targetIndex]!;
				const resolvedTargetSnapshot = this._pendingInlineHistoryRestore
					.shortcutOnly
					? this._resolveShortcutInlineHistoryTraversalSnapshot(
							targetSnapshot,
							this._pendingInlineHistoryRestore.sessionId ?? null,
						)
					: this._resolveInlineHistoryTraversalSnapshot(
							targetSnapshot,
						);
				this._applyInlineHistorySnapshot(resolvedTargetSnapshot, {
					historyTraversal: true,
				});
			}
			this._pendingInlineHistoryRestore = null;
			this._scheduleQueuedInlineHistoryShortcutFlush();
			return;
		}
		if (this._handledUndoHistoryRequestId === event.requestId) {
			this._handledUndoHistoryRequestId = null;
			return;
		}
		const selection = event.selection;
		if (selection?.type !== "text" || isCollapsed(selection)) {
			return;
		}
		const matchingSession = [...this._state.sessions]
			.reverse()
			.find(
				(session) =>
					session.surface === "inline-edit" &&
					session.status !== "cancelled" &&
					sessionSelectionMatches(this._editor, session, selection),
			);
		if (!matchingSession) {
			return;
		}
		this._setInlineSessionComposerOpen(matchingSession.id, true, {
			openReason: "history",
		});
	},

	_createInlineTurnUndoBeforeSnapshot(
		this: AIControllerImpl,
		sessionId: string,
		turnId: string,
	): AIInlineHistorySnapshot {
		const session =
			this._state.sessions.find((item) => item.id === sessionId) ?? null;
		if (session?.surface === "inline-edit") {
			const reviewSnapshot =
				this._findInlineHistorySnapshotForResolvedTurn(session, "undo");
			if (reviewSnapshot) {
				const restoredSessions = reviewSnapshot.sessions.map(
					(snapshotSession) => {
						if (
							snapshotSession.id !== sessionId ||
							snapshotSession.surface !== "inline-edit" ||
							!snapshotSession.contextualPrompt
						) {
							return snapshotSession;
						}
						const snapshotTurn =
							snapshotSession.turns.find(
								(turn) => turn.id === turnId,
							) ?? null;
						if (!snapshotTurn) {
							return snapshotSession;
						}
						return {
							...snapshotSession,
							contextualPrompt: {
								...snapshotSession.contextualPrompt,
								composer: {
									...snapshotSession.contextualPrompt
										.composer,
									draftPrompt:
										snapshotSession.contextualPrompt
											.composer.draftPrompt ||
										snapshotTurn.prompt,
								},
							},
						};
					},
				);
				return createInlineHistorySnapshot(
					this._editor,
					restoredSessions,
					sessionId,
					this._documentVersion,
					{ kind: "document-coupled" },
				);
			}
		}
		const historySessions = this._state.sessions.map((item) => {
			if (
				item.id !== sessionId ||
				item.surface !== "inline-edit" ||
				!item.contextualPrompt
			) {
				return item;
			}
			const targetTurn =
				item.turns.find((turn) => turn.id === turnId) ?? null;
			if (targetTurn?.status !== "review") {
				return item;
			}
			return {
				...item,
				contextualPrompt: {
					...item.contextualPrompt,
					composer: {
						...item.contextualPrompt.composer,
						isOpen: true,
						isSubmitting: false,
					},
				},
			};
		});
		const nextActiveSessionId = historySessions.some(
			(item) =>
				item.id === sessionId &&
				item.surface === "inline-edit" &&
				item.contextualPrompt?.composer.isOpen,
		)
			? sessionId
			: (this._state.activeSessionId ?? null);
		return createInlineHistorySnapshot(
			this._editor,
			historySessions,
			nextActiveSessionId,
			this._documentVersion,
			{ kind: "document-coupled" },
		);
	},
};
