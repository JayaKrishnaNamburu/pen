// @ts-nocheck
import type { AIControllerState, AIStreamEvent, AISession } from "../types";
import {
	areSessionsEqual,
	areStructuredValuesEqual,
	MAX_STREAM_EVENTS,
} from "./extensionHelpers";
import { inlineHistoryRecording } from "./controllers/inlineHistoryRecording";

export const aiControllerMethodsPart14 = {
	_updateSessionTurn(
		this: any,
		sessionId: string,
		turnId: string,
		overrides: Partial<AISession["turns"][number]>,
	): void {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		if (!session) {
			return;
		}
		const nextTurns = session.turns.map((turn) =>
			turn.id !== turnId
				? turn
				: {
						...turn,
						...overrides,
					},
		);
		if (areStructuredValuesEqual(session.turns, nextTurns)) {
			return;
		}
		const pendingSuggestionIds = [
			...new Set(nextTurns.flatMap((turn) => turn.suggestionIds)),
		];
		const pendingReviewItemIds = [
			...new Set(nextTurns.flatMap((turn) => turn.reviewItemIds)),
		];
		this._updateSession(sessionId, {
			turns: nextTurns,
			pendingSuggestionIds,
			pendingReviewItemIds,
		});
	},

	_syncSessionsFromDocument(this: any): boolean {
		if (this._state.sessions.length === 0) {
			return false;
		}
		const nextSessions = this._state.sessions.map((session) => {
			const nextTurns = session.turns.map((turn) => {
				const suggestionIds = turn.suggestionIds.filter(
					(sessionSuggestionId) =>
						this._suggestions.some(
							(suggestion) =>
								suggestion.id === sessionSuggestionId,
						),
				);
				const activeGenerationMatchesTurn =
					this._state.activeGeneration?.sessionId === session.id &&
					this._state.activeGeneration.turnId === turn.id;
				const activeGenerationForTurn = activeGenerationMatchesTurn
					? this._state.activeGeneration
					: null;
				const reviewItemIds = activeGenerationForTurn
					? (activeGenerationForTurn.reviewItems ?? [])
							.map((item) => item.id)
							.filter((id) => turn.reviewItemIds.includes(id))
					: [];
				const structuredPreview = activeGenerationForTurn
					? (activeGenerationForTurn.structuredPreview ??
						turn.structuredPreview ??
						null)
					: turn.reviewItemIds.length > 0
						? (turn.structuredPreview ?? null)
						: null;
				return {
					...turn,
					suggestionIds,
					reviewItemIds,
					structuredPreview,
				};
			});
			const pendingSuggestionIds = [
				...new Set(nextTurns.flatMap((turn) => turn.suggestionIds)),
			];
			const pendingReviewItemIds = [
				...new Set(nextTurns.flatMap((turn) => turn.reviewItemIds)),
			];
			const nextStatus =
				pendingSuggestionIds.length === 0 &&
				pendingReviewItemIds.length === 0 &&
				session.status === "streaming"
					? "complete"
					: session.status;
			return {
				...session,
				status: nextStatus,
				turns: nextTurns,
				pendingSuggestionIds,
				pendingReviewItemIds,
			};
		});
		if (areSessionsEqual(this._state.sessions, nextSessions)) {
			return false;
		}
		this._setState({
			sessions: nextSessions,
		});
		return true;
	},

	_setStreamEvents(this: any, nextEvents: readonly AIStreamEvent[]): void {
		this._streamEvents = nextEvents;
		this._emitStreamEvents();
	},

	_appendStreamEvent(this: any, event: AIStreamEvent): void {
		const lastEvent = this._streamEvents[this._streamEvents.length - 1];
		if (
			lastEvent?.type === "status" &&
			event.type === "status" &&
			lastEvent.generationId === event.generationId &&
			lastEvent.status === event.status
		) {
			return;
		}
		const nextEvents =
			this._streamEvents.length >= MAX_STREAM_EVENTS
				? [...this._streamEvents.slice(-(MAX_STREAM_EVENTS - 1)), event]
				: [...this._streamEvents, event];
		this._setStreamEvents(nextEvents);
	},

	_emit(this: any): void {
		for (const listener of this._listeners) {
			listener();
		}
		for (const listener of this._sessionListeners) {
			listener();
		}
	},

	_emitStreamEvents(this: any): void {
		for (const listener of this._streamEventListeners) {
			listener();
		}
	},

	...inlineHistoryRecording,
};
