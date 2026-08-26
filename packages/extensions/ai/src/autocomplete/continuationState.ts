import type {
	Anchor,
	ChangeSummary,
	Editor,
	OpOrigin,
	SelectionState,
} from "@input/pen-types";
import {
	deriveContentMoves,
	getOpOriginType,
	isCollapsed,
	isMultiBlock,
	repairAnchor,
} from "@input/pen-core";
import type { AutocompleteStructuredCandidate } from "./structuredCandidate";

export type AutocompleteSequence = {
	requestId: string;
	blockId: string;
	startOffset: number;
	candidate: AutocompleteStructuredCandidate;
	continuationDepth: number;
	requestPrefix?: string;
};

export type AcceptedContinuationTarget = {
	sourceRequestId: string;
	blockId: string;
	startOffset: number;
	continuationDepth: number;
	requestPrefix?: string;
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
	private _sequenceAnchor: Anchor | null = null;
	private _pendingAnchor: Anchor | null = null;
	private _prefetchedAnchor: Anchor | null = null;

	get sequence(): AutocompleteSequence | null {
		return this._sequence;
	}

	get hasPrefetchedContinuation(): boolean {
		return this._prefetchedContinuation !== null;
	}

	setSequence(sequence: AutocompleteSequence, editor?: Editor): void {
		this._sequence = sequence;
		this._sequenceAnchor = mintPoint(
			editor,
			sequence.blockId,
			sequence.startOffset,
		);
	}

	clearSequence(): void {
		this._sequence = null;
		this._sequenceAnchor = null;
		this._isAcceptingSequenceSegment = false;
	}

	clearContinuations(): void {
		this._prefetchedContinuation = null;
		this._pendingAcceptedContinuation = null;
		this._prefetchedAnchor = null;
		this._pendingAnchor = null;
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
		editor?: Editor,
	): void {
		this._pendingAcceptedContinuation = target;
		this._pendingAnchor = mintPoint(
			editor,
			target.blockId,
			target.startOffset,
		);
	}

	setPrefetchedContinuation(
		prefetched: PrefetchedContinuation,
		editor?: Editor,
	): void {
		this._prefetchedContinuation = prefetched;
		this._prefetchedAnchor = mintPoint(
			editor,
			prefetched.blockId,
			prefetched.startOffset,
		);
	}

	syncThroughCommit(editor: Editor, summary: ChangeSummary): boolean {
		if (this._sequence) {
			const synced = syncHeldPoint(
				editor,
				summary,
				this._sequenceAnchor,
				this._sequence.blockId,
				this._sequence.startOffset,
				this._sequence.requestPrefix,
			);
			if (synced.kind === "dead") {
				this.clearSequence();
				return false;
			}
			this._sequenceAnchor = synced.anchor;
			this._sequence = {
				...this._sequence,
				blockId: synced.blockId,
				startOffset: synced.startOffset,
			};
		}

		if (this._pendingAcceptedContinuation) {
			const synced = syncHeldPoint(
				editor,
				summary,
				this._pendingAnchor,
				this._pendingAcceptedContinuation.blockId,
				this._pendingAcceptedContinuation.startOffset,
				this._pendingAcceptedContinuation.requestPrefix,
			);
			if (synced.kind === "dead") {
				this.clearContinuations();
				return this._sequence !== null;
			}
			this._pendingAnchor = synced.anchor;
			this._pendingAcceptedContinuation = {
				...this._pendingAcceptedContinuation,
				blockId: synced.blockId,
				startOffset: synced.startOffset,
			};
		}

		if (this._prefetchedContinuation) {
			const synced = syncHeldPoint(
				editor,
				summary,
				this._prefetchedAnchor,
				this._prefetchedContinuation.blockId,
				this._prefetchedContinuation.startOffset,
				this._prefetchedContinuation.requestPrefix,
			);
			if (synced.kind === "dead") {
				this._prefetchedContinuation = null;
				this._prefetchedAnchor = null;
				return this._sequence !== null;
			}
			this._prefetchedAnchor = synced.anchor;
			this._prefetchedContinuation = {
				...this._prefetchedContinuation,
				blockId: synced.blockId,
				startOffset: synced.startOffset,
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
			!isCollapsed(selection) ||
			isMultiBlock(selection) ||
			selection.focus.blockId !== pending.blockId ||
			selection.focus.offset !== pending.startOffset
		) {
			return null;
		}

		this._pendingAcceptedContinuation = null;
		this._prefetchedContinuation = null;
		this._pendingAnchor = null;
		this._sequenceAnchor = this._prefetchedAnchor;
		this._prefetchedAnchor = null;
		this._sequence = {
			requestId: prefetched.requestId,
			blockId: prefetched.blockId,
			startOffset: prefetched.startOffset,
			candidate: prefetched.candidate,
			continuationDepth: prefetched.continuationDepth,
			requestPrefix: prefetched.requestPrefix,
		};
		return this._sequence;
	}
}

function mintPoint(
	editor: Editor | undefined,
	blockId: string,
	offset: number,
): Anchor | null {
	return editor?.anchors.create({ blockId, offset }, 1) ?? null;
}

function prefixStillMatches(
	editor: Editor,
	blockId: string,
	offset: number,
	requestPrefix: string | undefined,
): boolean {
	if (requestPrefix == null || requestPrefix.length === 0) {
		return true;
	}
	const block = editor.getBlock(blockId);
	if (!block) {
		return false;
	}
	return block.textContent().slice(0, offset).endsWith(requestPrefix);
}

function syncHeldPoint(
	editor: Editor,
	summary: ChangeSummary,
	held: Anchor | null,
	blockId: string,
	startOffset: number,
	requestPrefix: string | undefined,
):
	| {
			kind: "live";
			anchor: Anchor | null;
			blockId: string;
			startOffset: number;
	  }
	| { kind: "dead" } {
	const anchor =
		held ?? editor.anchors.create({ blockId, offset: startOffset }, 1);
	if (!anchor) {
		return { kind: "dead" };
	}
	const moves = deriveContentMoves(summary, undefined);
	const next = repairAnchor(editor, anchor, moves);
	const target = editor.anchors.resolve(next);
	if (!target) {
		return editor.getBlock(next.blockId) || editor.getBlock(blockId)
			? {
					kind: "live",
					anchor: next,
					blockId,
					startOffset,
				}
			: { kind: "dead" };
	}
	if (
		!prefixStillMatches(
			editor,
			target.blockId,
			target.offset,
			requestPrefix,
		)
	) {
		return { kind: "dead" };
	}
	return {
		kind: "live",
		anchor: next,
		blockId: target.blockId,
		startOffset: target.offset,
	};
}
