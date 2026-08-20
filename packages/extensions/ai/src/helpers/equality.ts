import type { TextSelection } from "@input/pen-types";
import type {
	AIControllerState,
	AIInlineHistorySnapshot,
	AISession,
	AISessionSelectionSnapshot,
	AISessionTarget,
	PersistentSuggestion,
} from "../types";
import { selectionMatchesSnapshot } from "./session";
import type { AIInlineShortcutHistoryState } from "./types";
import { resolveSessionSelectionSnapshot } from "./types";

export function areStructuredValuesEqual(previous: unknown, next: unknown): boolean {
	if (previous === next) {
		return true;
	}
	if (!previous || !next) {
		return previous === next;
	}

	try {
		return JSON.stringify(previous) === JSON.stringify(next);
	} catch {
		// cyclic or unstringifiable values are not equal.
		return false;
	}
}

export function areStringArraysEqual(
	previous: readonly string[] | undefined,
	next: readonly string[] | undefined,
): boolean {
	if (previous === next) {
		return true;
	}
	if (!previous || !next) {
		return previous === next;
	}
	if (previous.length !== next.length) {
		return false;
	}

	for (let index = 0; index < previous.length; index += 1) {
		if (previous[index] !== next[index]) {
			return false;
		}
	}

	return true;
}

export function resolveSessionSelectionSnapshots(
	session: AISession,
): readonly AISessionSelectionSnapshot[] {
	const snapshots: AISessionSelectionSnapshot[] = [];
	const activeTurn =
		session.activeTurnId != null
			? (session.turns.find((turn) => turn.id === session.activeTurnId) ??
				null)
			: (session.turns[session.turns.length - 1] ?? null);
	if (activeTurn?.selection) {
		snapshots.push(activeTurn.selection);
	}
	if (session.contextualPrompt?.anchor.selectionSnapshot) {
		snapshots.push(session.contextualPrompt.anchor.selectionSnapshot);
	}
	if (session.target.kind === "selection") {
		snapshots.push(
			resolveSessionSelectionSnapshot(session.target.selection),
		);
	}
	return snapshots;
}

export function sessionTargetMatches(
	session: AISession,
	target: AISessionTarget,
): boolean {
	if (session.target.kind !== target.kind) {
		return false;
	}
	if (target.kind !== "selection") {
		return areStructuredValuesEqual(session.target, target);
	}
	return sessionSelectionMatches(session, target.selection);
}

export function sessionSelectionMatches(
	session: AISession,
	selection: TextSelection,
): boolean {
	return resolveSessionSelectionSnapshots(session).some((snapshot) =>
		selectionMatchesSnapshot(selection, snapshot),
	);
}

export function appendUniqueString(
	values: readonly string[],
	value: string,
): string[] {
	return values.includes(value) ? [...values] : [...values, value];
}

export function areSuggestionsEqual(
	previous: readonly PersistentSuggestion[],
	next: readonly PersistentSuggestion[],
): boolean {
	if (previous.length !== next.length) {
		return false;
	}

	for (let index = 0; index < previous.length; index += 1) {
		const previousSuggestion = previous[index];
		const nextSuggestion = next[index];
		if (
			previousSuggestion.id !== nextSuggestion.id ||
			previousSuggestion.kind !== nextSuggestion.kind ||
			previousSuggestion.blockId !== nextSuggestion.blockId ||
			previousSuggestion.action !== nextSuggestion.action ||
			previousSuggestion.author !== nextSuggestion.author ||
			previousSuggestion.authorType !== nextSuggestion.authorType ||
			previousSuggestion.createdAt !== nextSuggestion.createdAt ||
			previousSuggestion.model !== nextSuggestion.model ||
			previousSuggestion.sessionId !== nextSuggestion.sessionId
		) {
			return false;
		}
		if (
			previousSuggestion.kind === "text" &&
			nextSuggestion.kind === "text" &&
			(previousSuggestion.offset !== nextSuggestion.offset ||
				previousSuggestion.length !== nextSuggestion.length)
		) {
			return false;
		}
		if (
			previousSuggestion.kind === "block" &&
			nextSuggestion.kind === "block" &&
			JSON.stringify(previousSuggestion.previousState) !==
				JSON.stringify(nextSuggestion.previousState)
		) {
			return false;
		}
	}

	return true;
}

export function areAIControllerStatesEqual(
	previous: AIControllerState,
	next: AIControllerState,
): boolean {
	if (
		previous.status !== next.status ||
		previous.activeSessionId !== next.activeSessionId ||
		previous.suggestMode !== next.suggestMode ||
		previous.commandMenuOpen !== next.commandMenuOpen ||
		previous.lastRoute !== next.lastRoute ||
		!areStructuredValuesEqual(
			previous.streamingReviewPreview,
			next.streamingReviewPreview,
		)
	) {
		return false;
	}

	if (
		!areGenerationsEqual(previous.activeGeneration, next.activeGeneration)
	) {
		return false;
	}

	if (
		!areEphemeralSuggestionsEqual(
			previous.ephemeralSuggestion,
			next.ephemeralSuggestion,
		)
	) {
		return false;
	}

	return areSessionsEqual(previous.sessions, next.sessions);
}

export function areGenerationsEqual(
	previous: AIControllerState["activeGeneration"],
	next: AIControllerState["activeGeneration"],
): boolean {
	if (previous === next) {
		return true;
	}
	if (!previous || !next) {
		return previous === next;
	}

	if (
		previous.id !== next.id ||
		previous.zoneId !== next.zoneId ||
		previous.blockId !== next.blockId ||
		previous.target !== next.target ||
		previous.sessionId !== next.sessionId ||
		previous.surface !== next.surface ||
		previous.prompt !== next.prompt ||
		previous.status !== next.status ||
		previous.tokenCount !== next.tokenCount ||
		previous.undoGroupId !== next.undoGroupId ||
		previous.text !== next.text ||
		previous.commandId !== next.commandId ||
		previous.contentFormat !== next.contentFormat ||
		previous.route !== next.route ||
		previous.mutationMode !== next.mutationMode ||
		previous.planState !== next.planState ||
		previous.targetKind !== next.targetKind ||
		!areStructuredValuesEqual(
			previous.structuredPreview,
			next.structuredPreview,
		) ||
		!areStructuredValuesEqual(previous.reviewItems, next.reviewItems) ||
		!areStructuredValuesEqual(previous.plan, next.plan) ||
		!areStructuredValuesEqual(previous.debug, next.debug)
	) {
		return false;
	}

	if (!areStringArraysEqual(previous.suggestionIds, next.suggestionIds)) {
		return false;
	}

	if (previous.steps.length !== next.steps.length) {
		return false;
	}

	for (let index = 0; index < previous.steps.length; index += 1) {
		const previousStep = previous.steps[index];
		const nextStep = next.steps[index];
		if (
			previousStep.index !== nextStep.index ||
			previousStep.type !== nextStep.type ||
			previousStep.toolName !== nextStep.toolName ||
			previousStep.toolCallId !== nextStep.toolCallId ||
			previousStep.status !== nextStep.status ||
			previousStep.input !== nextStep.input ||
			previousStep.output !== nextStep.output
		) {
			return false;
		}
	}

	return true;
}

export function areSessionsEqual(
	previous: readonly AISession[],
	next: readonly AISession[],
): boolean {
	if (previous.length !== next.length) {
		return false;
	}
	for (let index = 0; index < previous.length; index += 1) {
		const previousSession = previous[index];
		const nextSession = next[index];
		if (
			!previousSession ||
			!nextSession ||
			previousSession.id !== nextSession.id ||
			previousSession.surface !== nextSession.surface ||
			previousSession.status !== nextSession.status ||
			previousSession.createdAt !== nextSession.createdAt ||
			previousSession.updatedAt !== nextSession.updatedAt ||
			previousSession.activeTurnId !== nextSession.activeTurnId ||
			!areStructuredValuesEqual(
				previousSession.target,
				nextSession.target,
			) ||
			!areStructuredValuesEqual(
				previousSession.anchor,
				nextSession.anchor,
			) ||
			!areStructuredValuesEqual(
				previousSession.contextualPrompt,
				nextSession.contextualPrompt,
			) ||
			!areStructuredValuesEqual(
				previousSession.turns,
				nextSession.turns,
			) ||
			!areStructuredValuesEqual(
				previousSession.promptHistory,
				nextSession.promptHistory,
			) ||
			!areStringArraysEqual(
				previousSession.generationIds,
				nextSession.generationIds,
			) ||
			!areStringArraysEqual(
				previousSession.pendingSuggestionIds,
				nextSession.pendingSuggestionIds,
			) ||
			!areStringArraysEqual(
				previousSession.pendingReviewItemIds,
				nextSession.pendingReviewItemIds,
			) ||
			!areStructuredValuesEqual(
				previousSession.metrics,
				nextSession.metrics,
			)
		) {
			return false;
		}
	}
	return true;
}

export function areInlineHistorySnapshotsEqual(
	previous: AIInlineHistorySnapshot,
	next: AIInlineHistorySnapshot,
): boolean {
	return (
		previous.activeSessionId === next.activeSessionId &&
		previous.documentVersion === next.documentVersion &&
		previous.kind === next.kind &&
		areSessionsEqual(previous.sessions, next.sessions)
	);
}

export function didInlineHistoryCheckpointChange(
	previousState: AIControllerState,
	nextState: AIControllerState,
): boolean {
	return !areStructuredValuesEqual(
		buildInlineHistoryCheckpoint(previousState),
		buildInlineHistoryCheckpoint(nextState),
	);
}

export function buildInlineHistoryCheckpoint(state: AIControllerState): {
	activeSessionId: string | null;
	sessions: Array<{
		id: string;
		isOpen: boolean;
		target: AISessionSelectionSnapshot | null;
		latestSettledTurn: {
			id: string;
			prompt: string;
			selection: AISessionSelectionSnapshot | null;
		} | null;
		settledTurnCount: number;
	}>;
} {
	const inlineSessions = state.sessions.filter(
		(session) => session.surface === "inline-edit",
	);
	return {
		activeSessionId: state.activeSessionId ?? null,
		sessions: inlineSessions.map((session) => {
			const settledTurns = session.turns.filter(
				(turn) => turn.status !== "streaming",
			);
			const latestSettledTurn =
				settledTurns[settledTurns.length - 1] ?? null;
			return {
				id: session.id,
				isOpen: session.contextualPrompt?.composer.isOpen ?? false,
				target:
					session.contextualPrompt?.anchor.selectionSnapshot ??
					(session.target.kind === "selection"
						? resolveSessionSelectionSnapshot(
								session.target.selection,
							)
						: null),
				latestSettledTurn: latestSettledTurn
					? {
							id: latestSettledTurn.id,
							prompt: latestSettledTurn.prompt,
							selection: latestSettledTurn.selection ?? null,
						}
					: null,
				settledTurnCount: settledTurns.length,
			};
		}),
	};
}

export function countSettledInlineTurns(
	snapshot: AIInlineHistorySnapshot,
	sessionId?: string | null,
): number {
	if (sessionId) {
		const session = snapshot.sessions.find(
			(item) => item.id === sessionId && item.surface === "inline-edit",
		);
		if (!session) {
			return 0;
		}
		return session.turns.filter((turn) => turn.status !== "streaming")
			.length;
	}
	return snapshot.sessions
		.filter((session) => session.surface === "inline-edit")
		.reduce(
			(count, session) =>
				count +
				session.turns.filter((turn) => turn.status !== "streaming")
					.length,
			0,
		);
}

export function hasStreamingInlineTurns(
	snapshot: AIInlineHistorySnapshot,
	sessionId?: string | null,
): boolean {
	if (sessionId) {
		const session = snapshot.sessions.find(
			(item) => item.id === sessionId && item.surface === "inline-edit",
		);
		return (
			session?.turns.some((turn) => turn.status === "streaming") ?? false
		);
	}
	return snapshot.sessions
		.filter((session) => session.surface === "inline-edit")
		.some((session) =>
			session.turns.some((turn) => turn.status === "streaming"),
		);
}

export function resolveInlineShortcutHistoryState(
	snapshot: AIInlineHistorySnapshot,
	sessionId: string | null,
): AIInlineShortcutHistoryState | null {
	const session = sessionId
		? (snapshot.sessions.find(
				(item) =>
					item.id === sessionId && item.surface === "inline-edit",
			) ?? null)
		: null;
	if (!session) {
		return {
			sessionId: null,
			phase: "none",
			turnCount: 0,
			turnId: null,
		};
	}
	const durableTurns = session.turns.filter(
		(turn) => turn.status !== "streaming" && turn.status !== "cancelled",
	);
	if (durableTurns.length === 0) {
		return {
			sessionId: null,
			phase: "none",
			turnCount: 0,
			turnId: null,
		};
	}
	const latestTurn = durableTurns[durableTurns.length - 1] ?? null;
	if (!latestTurn) {
		return null;
	}
	if (latestTurn.status === "review") {
		return {
			sessionId,
			phase: "review",
			turnCount: durableTurns.length,
			turnId: latestTurn.id,
		};
	}
	if (latestTurn.status === "accepted" || latestTurn.status === "rejected") {
		return {
			sessionId,
			phase: "resolved",
			turnCount: durableTurns.length,
			turnId: latestTurn.id,
			resolution: latestTurn.status,
		};
	}
	return null;
}

export function areInlineShortcutHistoryStatesEqual(
	left: AIInlineShortcutHistoryState,
	right: AIInlineShortcutHistoryState,
): boolean {
	return (
		left.sessionId === right.sessionId &&
		left.phase === right.phase &&
		left.turnCount === right.turnCount &&
		left.turnId === right.turnId &&
		left.resolution === right.resolution
	);
}

export function shouldReplaceInlineShortcutWaypointRepresentative(
	state: AIInlineShortcutHistoryState,
	currentSnapshot: AIInlineHistorySnapshot | null,
	nextSnapshot: AIInlineHistorySnapshot,
): boolean {
	if (!currentSnapshot) {
		return true;
	}
	const currentSession = state.sessionId
		? (currentSnapshot.sessions.find(
				(session) =>
					session.id === state.sessionId &&
					session.surface === "inline-edit",
			) ?? null)
		: null;
	const nextSession = state.sessionId
		? (nextSnapshot.sessions.find(
				(session) =>
					session.id === state.sessionId &&
					session.surface === "inline-edit",
			) ?? null)
		: null;
	if (state.phase === "review") {
		const currentOpen =
			currentSession?.contextualPrompt?.composer.isOpen === true;
		const nextOpen =
			nextSession?.contextualPrompt?.composer.isOpen === true;
		if (currentOpen !== nextOpen) {
			return nextOpen;
		}
	}
	if (state.phase === "resolved") {
		const currentOpen =
			currentSession?.contextualPrompt?.composer.isOpen === true;
		const nextOpen =
			nextSession?.contextualPrompt?.composer.isOpen === true;
		if (currentOpen !== nextOpen) {
			return !nextOpen;
		}
	}
	return true;
}

export function areEphemeralSuggestionsEqual(
	previous: AIControllerState["ephemeralSuggestion"],
	next: AIControllerState["ephemeralSuggestion"],
): boolean {
	if (previous === next) {
		return true;
	}
	if (!previous || !next) {
		return previous === next;
	}

	return (
		previous.id === next.id &&
		previous.blockId === next.blockId &&
		previous.offset === next.offset &&
		previous.text === next.text &&
		previous.type === next.type &&
		previous.blockType === next.blockType &&
		previous.props === next.props
	);
}
