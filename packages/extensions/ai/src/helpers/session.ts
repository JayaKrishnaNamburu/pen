import { generateId, type Editor, type TextSelection } from "@input/pen-types";
import type {
	AIInlineHistorySnapshot,
	AISession,
	AISessionSelectionSnapshot,
	AISessionTarget,
} from "../types";
import {
	resolveActiveBlockId,
	resolveSessionSelectionSnapshot,
} from "./types";

export function resolveContextualPromptAnchor(
	target: AISessionTarget,
): NonNullable<AISession["contextualPrompt"]>["anchor"] {
	if (target.kind === "selection") {
		const range = target.selection.toRange();
		return {
			kind: "text-range",
			selectionSnapshot: resolveSessionSelectionSnapshot(
				target.selection,
			),
			focusBlockId: range.start.blockId,
			status: "valid",
			lastResolvedRect: null,
		};
	}
	if (target.kind === "block") {
		return {
			kind: "block",
			focusBlockId: target.blockId,
			status: "valid",
			lastResolvedRect: null,
		};
	}
	return {
		kind: "document",
		focusBlockId: null,
		status: "valid",
		lastResolvedRect: null,
	};
}

export function resolveContextualPromptState(
	target: AISessionTarget,
): NonNullable<AISession["contextualPrompt"]> {
	return {
		anchor: resolveContextualPromptAnchor(target),
		composer: {
			draftPrompt: "",
			isOpen: true,
			isSubmitting: false,
			canSubmitFollowUp: true,
			openReason: "user",
		},
	};
}

export function createInlineHistorySnapshot(
	editor: Editor,
	sessions: readonly AISession[],
	activeSessionId: string | null,
	documentVersion: number,
	options?: {
		kind?: AIInlineHistorySnapshot["kind"];
	},
): AIInlineHistorySnapshot {
	return {
		id: generateId(),
		sessionId: activeSessionId,
		sessions: cloneInlineHistorySessions(editor, sessions),
		activeSessionId,
		documentVersion,
		kind: options?.kind ?? "document-coupled",
	};
}

export function cloneSessionTarget(
	editor: Editor,
	target: AISessionTarget,
): AISessionTarget {
	if (target.kind !== "selection") {
		return { ...target };
	}
	return {
		kind: "selection",
		blockId: target.blockId,
		selection: recreateTextSelection(
			editor,
			resolveSessionSelectionSnapshot(target.selection),
		),
	};
}

export function cloneInlineHistorySessions(
	editor: Editor,
	sessions: readonly AISession[],
): AISession[] {
	return sessions.map((session) => ({
		...session,
		target: cloneSessionTarget(editor, session.target),
		contextualPrompt: session.contextualPrompt
			? {
					...session.contextualPrompt,
					anchor: {
						...session.contextualPrompt.anchor,
						selectionSnapshot: session.contextualPrompt.anchor
							.selectionSnapshot
							? {
									...session.contextualPrompt.anchor
										.selectionSnapshot,
									anchor: {
										...session.contextualPrompt.anchor
											.selectionSnapshot.anchor,
									},
									focus: {
										...session.contextualPrompt.anchor
											.selectionSnapshot.focus,
									},
									blockRange: [
										...session.contextualPrompt.anchor
											.selectionSnapshot.blockRange,
									],
								}
							: undefined,
					},
					composer: {
						...session.contextualPrompt.composer,
					},
				}
			: undefined,
		turns: session.turns.map((turn) => ({
			...turn,
			suggestionIds: [...turn.suggestionIds],
			reviewItemIds: [...turn.reviewItemIds],
			anchor: turn.anchor ? { ...turn.anchor } : undefined,
			selection: turn.selection
				? {
						...turn.selection,
						anchor: { ...turn.selection.anchor },
						focus: { ...turn.selection.focus },
						blockRange: [...turn.selection.blockRange],
					}
				: undefined,
		})),
		promptHistory: session.promptHistory.map((prompt) => ({ ...prompt })),
		generationIds: [...session.generationIds],
		pendingSuggestionIds: [...session.pendingSuggestionIds],
		pendingReviewItemIds: [...session.pendingReviewItemIds],
		metrics: {
			...session.metrics,
			fastApply: { ...session.metrics.fastApply },
		},
		anchor: session.anchor ? { ...session.anchor } : undefined,
	}));
}

export function recreateTextSelection(
	editor: Editor,
	snapshot: AISessionSelectionSnapshot,
): TextSelection {
	const blockRange = resolveSelectionSnapshotBlockRange(editor, snapshot);
	const isCollapsed =
		snapshot.anchor.blockId === snapshot.focus.blockId &&
		snapshot.anchor.offset === snapshot.focus.offset;
	const documentRange = {
		start: resolveSelectionSnapshotRangeStart(snapshot, blockRange),
		end: resolveSelectionSnapshotRangeEnd(snapshot, blockRange),
		get isMultiBlock() {
			return blockRange.length > 1;
		},
		get blockRange() {
			return [...blockRange];
		},
		contains(point: { blockId: string; offset: number }): boolean {
			if (!blockRange.includes(point.blockId)) {
				return false;
			}
			const isSingleBlock = blockRange.length === 1;
			if (isSingleBlock) {
				return (
					point.offset >= this.start.offset &&
					point.offset <= this.end.offset
				);
			}
			if (point.blockId === this.start.blockId) {
				return point.offset >= this.start.offset;
			}
			if (point.blockId === this.end.blockId) {
				return point.offset <= this.end.offset;
			}
			return true;
		},
		overlaps(other: {
			start: { blockId: string; offset: number };
			end: { blockId: string; offset: number };
			contains: (point: { blockId: string; offset: number }) => boolean;
		}): boolean {
			return (
				this.contains(other.start) ||
				this.contains(other.end) ||
				other.contains(this.start)
			);
		},
		equals(other: {
			start: { blockId: string; offset: number };
			end: { blockId: string; offset: number };
		}): boolean {
			return (
				this.start.blockId === other.start.blockId &&
				this.start.offset === other.start.offset &&
				this.end.blockId === other.end.blockId &&
				this.end.offset === other.end.offset
			);
		},
		toTextSelection() {
			return recreateTextSelection(editor, snapshot);
		},
	};
	return {
		type: "text",
		anchor: { ...snapshot.anchor },
		focus: { ...snapshot.focus },
		get isCollapsed() {
			return isCollapsed;
		},
		get isMultiBlock() {
			return blockRange.length > 1;
		},
		get blockRange() {
			return [...blockRange];
		},
		toRange() {
			return documentRange;
		},
	};
}

export function resolveSelectionSnapshotBlockRange(
	editor: Editor,
	snapshot: AISessionSelectionSnapshot,
): string[] {
	if (snapshot.blockRange.length > 0) {
		return [...snapshot.blockRange];
	}
	const blockOrder = editor.documentState.blockOrder;
	const anchorIndex = blockOrder.indexOf(snapshot.anchor.blockId);
	const focusIndex = blockOrder.indexOf(snapshot.focus.blockId);
	if (anchorIndex === -1 || focusIndex === -1) {
		return [snapshot.anchor.blockId];
	}
	const startIndex = Math.min(anchorIndex, focusIndex);
	const endIndex = Math.max(anchorIndex, focusIndex);
	return blockOrder.slice(startIndex, endIndex + 1);
}

export function resolveSelectionSnapshotRangeStart(
	snapshot: AISessionSelectionSnapshot,
	blockRange: readonly string[],
): { blockId: string; offset: number } {
	if (blockRange.length <= 1) {
		return {
			blockId: snapshot.anchor.blockId,
			offset: Math.min(snapshot.anchor.offset, snapshot.focus.offset),
		};
	}
	const firstBlockId = blockRange[0] ?? snapshot.anchor.blockId;
	return snapshot.anchor.blockId === firstBlockId
		? { ...snapshot.anchor }
		: { ...snapshot.focus };
}

export function resolveSelectionSnapshotRangeEnd(
	snapshot: AISessionSelectionSnapshot,
	blockRange: readonly string[],
): { blockId: string; offset: number } {
	if (blockRange.length <= 1) {
		return {
			blockId: snapshot.anchor.blockId,
			offset: Math.max(snapshot.anchor.offset, snapshot.focus.offset),
		};
	}
	const lastBlockId =
		blockRange[blockRange.length - 1] ?? snapshot.focus.blockId;
	return snapshot.anchor.blockId === lastBlockId
		? { ...snapshot.anchor }
		: { ...snapshot.focus };
}

export function resolveSessionTarget(
	editor: Editor,
	target: "auto" | "selection" | "block" | "document" | undefined,
): AISessionTarget {
	if (target === "document") {
		return { kind: "document" };
	}
	const selection = editor.selection;
	if (
		(target === "selection" || target === "auto") &&
		selection?.type === "text" &&
		!selection.isCollapsed
	) {
		const range = selection.toRange();
		const selectionSnapshot = resolveSessionSelectionSnapshot(selection);
		return {
			kind: "selection",
			selection: recreateTextSelection(editor, selectionSnapshot),
			blockId: range.start.blockId,
		};
	}
	const blockId =
		target === "block" || target === "auto"
			? (resolveActiveBlockId(selection) ??
				editor.lastBlock()?.id ??
				editor.firstBlock()?.id ??
				null)
			: null;
	return blockId ? { kind: "block", blockId } : { kind: "document" };
}

export function selectionMatchesSnapshot(
	selection: TextSelection,
	snapshot: AISessionSelectionSnapshot | null,
): boolean {
	if (!snapshot) {
		return false;
	}

	return (
		selection.anchor.blockId === snapshot.anchor.blockId &&
		selection.anchor.offset === snapshot.anchor.offset &&
		selection.focus.blockId === snapshot.focus.blockId &&
		selection.focus.offset === snapshot.focus.offset &&
		selection.isMultiBlock === snapshot.isMultiBlock &&
		selection.blockRange.length === snapshot.blockRange.length &&
		selection.blockRange.every(
			(blockId, index) => blockId === snapshot.blockRange[index],
		)
	);
}
