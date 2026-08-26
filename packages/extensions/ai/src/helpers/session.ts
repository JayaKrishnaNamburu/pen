import {
	createTextSelection,
	getSelectionBlockRange,
	isCollapsed,
	isMultiBlock,
	selectionToRange,
} from "@input/pen-core";
import { generateId, type Editor, type TextSelection } from "@input/pen-types";
import type {
	AIInlineHistorySnapshot,
	AISession,
	AISessionSelectionSnapshot,
	AISessionTarget,
} from "../types";
import { resolveActiveBlockId, resolveSessionSelectionSnapshot } from "./types";

export function resolveContextualPromptAnchor(
	editor: Editor,
	target: AISessionTarget,
): NonNullable<AISession["contextualPrompt"]>["anchor"] {
	if (target.kind === "selection") {
		const range = selectionToRange(editor.internals.doc, target.selection);
		return {
			kind: "text-range",
			selectionSnapshot: resolveSessionSelectionSnapshot(
				editor,
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
	editor: Editor,
	target: AISessionTarget,
): NonNullable<AISession["contextualPrompt"]> {
	return {
		anchor: resolveContextualPromptAnchor(editor, target),
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

function cloneSessionTarget(
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
			resolveSessionSelectionSnapshot(editor, target.selection),
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
		metrics: {
			...session.metrics,
			commit: { ...session.metrics.commit },
		},
		anchor: session.anchor ? { ...session.anchor } : undefined,
	}));
}

export function recreateTextSelection(
	_editor: Editor,
	snapshot: AISessionSelectionSnapshot,
): TextSelection {
	return createTextSelection({
		anchor: snapshot.anchor,
		focus: snapshot.focus,
	});
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
		!isCollapsed(selection)
	) {
		const range = selectionToRange(editor.internals.doc, selection);
		const selectionSnapshot = resolveSessionSelectionSnapshot(
			editor,
			selection,
		);
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
	editor: Editor,
	selection: TextSelection,
	snapshot: AISessionSelectionSnapshot | null,
): boolean {
	if (!snapshot) {
		return false;
	}

	const blockRange = getSelectionBlockRange(editor.internals.doc, selection);
	return (
		selection.anchor.blockId === snapshot.anchor.blockId &&
		selection.anchor.offset === snapshot.anchor.offset &&
		selection.focus.blockId === snapshot.focus.blockId &&
		selection.focus.offset === snapshot.focus.offset &&
		isMultiBlock(selection) === snapshot.isMultiBlock &&
		blockRange.length === snapshot.blockRange.length &&
		blockRange.every(
			(blockId, index) => blockId === snapshot.blockRange[index],
		)
	);
}
