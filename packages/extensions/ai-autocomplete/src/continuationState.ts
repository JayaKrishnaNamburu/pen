import type { ChangeSummary, OpOrigin, SelectionState } from "@input/pen-types";
import { getOpOriginType } from "@input/pen-core";
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

	consumeAcceptedAiCommit(origin: OpOrigin): boolean {
		if (
			!this._isAcceptingSequenceSegment ||
			getOpOriginType(origin) !== "ai"
		) {
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

	mapThroughSummary(summary: ChangeSummary): boolean {
		if (this._sequence) {
			const mapped = mapAnchor(
				summary,
				this._sequence.blockId,
				this._sequence.startOffset,
			);
			if (!mapped) {
				this.clearSequence();
				return false;
			}
			this._sequence = {
				...this._sequence,
				blockId: mapped.blockId,
				startOffset: mapped.startOffset,
			};
		}

		if (this._pendingAcceptedContinuation) {
			const mapped = mapAnchor(
				summary,
				this._pendingAcceptedContinuation.blockId,
				this._pendingAcceptedContinuation.startOffset,
			);
			if (!mapped) {
				this.clearContinuations();
				return this._sequence !== null;
			}
			this._pendingAcceptedContinuation = {
				...this._pendingAcceptedContinuation,
				blockId: mapped.blockId,
				startOffset: mapped.startOffset,
			};
		}

		if (this._prefetchedContinuation) {
			const mapped = mapAnchor(
				summary,
				this._prefetchedContinuation.blockId,
				this._prefetchedContinuation.startOffset,
			);
			if (!mapped) {
				this._prefetchedContinuation = null;
				return this._sequence !== null;
			}
			this._prefetchedContinuation = {
				...this._prefetchedContinuation,
				blockId: mapped.blockId,
				startOffset: mapped.startOffset,
			};
		}

		return true;
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

function mapAnchor(
	summary: ChangeSummary,
	blockId: string,
	startOffset: number,
): { blockId: string; startOffset: number } | null {
	const mapped = summary.mapPoint(
		{ blockId, offset: startOffset },
		1,
		"delete",
	);
	if (!mapped) {
		return null;
	}
	return { blockId: mapped.blockId, startOffset: mapped.offset };
}
