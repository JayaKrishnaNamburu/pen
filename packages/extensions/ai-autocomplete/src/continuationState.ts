import type { SelectionState } from "@pen/types";
import type { AutocompleteStructuredCandidate } from "./structuredCandidate";

export type AutocompleteSequence = {
	requestId: string;
	blockId: string;
	startOffset: number;
	candidate: AutocompleteStructuredCandidate;
	continuationDepth: number;
};

export type AcceptedContinuationTarget = {
	sourceRequestId: string;
	blockId: string;
	startOffset: number;
	continuationDepth: number;
};

export type PrefetchedContinuation = AcceptedContinuationTarget & {
	requestId: string;
	candidate: AutocompleteStructuredCandidate;
};

export class AutocompleteContinuationState {
	private _sequence: AutocompleteSequence | null = null;
	private _isAcceptingSequenceSegment = false;
	private _prefetchedContinuation: PrefetchedContinuation | null = null;
	private _pendingAcceptedContinuation: AcceptedContinuationTarget | null =
		null;

	get sequence(): AutocompleteSequence | null {
		return this._sequence;
	}

	get hasPrefetchedContinuation(): boolean {
		return this._prefetchedContinuation !== null;
	}

	get hasPendingOrPrefetchedContinuation(): boolean {
		return (
			this._pendingAcceptedContinuation !== null ||
			this._prefetchedContinuation !== null
		);
	}

	setSequence(sequence: AutocompleteSequence): void {
		this._sequence = sequence;
	}

	clearSequence(): void {
		this._sequence = null;
		this._isAcceptingSequenceSegment = false;
	}

	clearContinuations(): void {
		this._prefetchedContinuation = null;
		this._pendingAcceptedContinuation = null;
	}

	reset(): void {
		this.clearSequence();
		this.clearContinuations();
	}

	beginAcceptingSequenceSegment(): void {
		this._isAcceptingSequenceSegment = true;
	}

	consumeAcceptedAiCommit(origin: unknown): boolean {
		if (!this._isAcceptingSequenceSegment || origin !== "ai") {
			return false;
		}
		this._isAcceptingSequenceSegment = false;
		return true;
	}

	setPendingAcceptedContinuation(
		target: AcceptedContinuationTarget,
	): void {
		this._pendingAcceptedContinuation = target;
	}

	setPrefetchedContinuation(prefetched: PrefetchedContinuation): void {
		this._prefetchedContinuation = prefetched;
	}

	activatePendingAcceptedContinuation(
		selection: SelectionState,
	): AutocompleteSequence | null {
		const prefetched = this._prefetchedContinuation;
		const pending = this._pendingAcceptedContinuation;
		if (!prefetched || !pending) {
			return null;
		}
		if (
			prefetched.sourceRequestId !== pending.sourceRequestId ||
			prefetched.blockId !== pending.blockId ||
			prefetched.startOffset !== pending.startOffset
		) {
			return null;
		}
		if (
			selection?.type !== "text" ||
			!selection.isCollapsed ||
			selection.isMultiBlock ||
			selection.focus.blockId !== pending.blockId ||
			selection.focus.offset !== pending.startOffset
		) {
			return null;
		}

		this._pendingAcceptedContinuation = null;
		this._prefetchedContinuation = null;
		this._sequence = {
			requestId: prefetched.requestId,
			blockId: prefetched.blockId,
			startOffset: prefetched.startOffset,
			candidate: prefetched.candidate,
			continuationDepth: prefetched.continuationDepth,
		};
		return this._sequence;
	}
}
