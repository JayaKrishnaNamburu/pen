import { isCollapsed } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { readAllSuggestions } from "../suggestions/persistent";
import type {
	AIRequestedOperation,
	AISessionTarget,
	PersistentTextSuggestion,
} from "../types";
import { recreateTextSelection, resolveSessionTarget } from "./session";

export function resolveLiveInlineSelectionTarget(
	editor: Editor,
): Extract<AISessionTarget, { kind: "selection" }> | null {
	const selection = editor.selection;
	if (selection?.type !== "text" || isCollapsed(selection)) {
		return null;
	}
	const target = resolveSessionTarget(editor, "selection");
	return target.kind === "selection" ? target : null;
}

export function resolvePendingInlineSelectionTarget(
	editor: Editor,
	operation: AIRequestedOperation | undefined,
	suggestionIds: readonly string[],
): Extract<AISessionTarget, { kind: "selection" }> | null {
	if (
		operation?.kind !== "rewrite-selection" ||
		operation.target.kind !== "selection" ||
		operation.target.anchor.blockId !== operation.target.focus.blockId
	) {
		return null;
	}
	const textSuggestions = readAllSuggestions(editor).filter(
		(suggestion): suggestion is PersistentTextSuggestion =>
			suggestion.kind === "text" &&
			(suggestion.action === "insert" ||
				suggestion.action === "delete") &&
			suggestionIds.includes(suggestion.id),
	);
	if (textSuggestions.length === 0) {
		return null;
	}
	const blockId = operation.target.anchor.blockId;
	const startOffset = Math.min(
		operation.target.anchor.offset,
		operation.target.focus.offset,
	);
	const previewSpanLength = textSuggestions.reduce(
		(totalLength, suggestion) => totalLength + suggestion.length,
		0,
	);
	const endOffset = startOffset + previewSpanLength;
	if (endOffset <= startOffset) {
		return null;
	}
	return {
		kind: "selection",
		blockId,
		selection: recreateTextSelection(editor, {
			anchor: { blockId, offset: startOffset },
			focus: { blockId, offset: endOffset },
			blockRange: [blockId],
			isMultiBlock: false,
		}),
	};
}

export function resolveAcceptedInlineSelectionTarget(
	editor: Editor,
	operation: AIRequestedOperation | undefined,
	suggestionIds: readonly string[],
): Extract<AISessionTarget, { kind: "selection" }> | null {
	if (
		operation?.kind !== "rewrite-selection" ||
		operation.target.kind !== "selection" ||
		operation.target.anchor.blockId !== operation.target.focus.blockId
	) {
		return null;
	}
	const insertSuggestions = readAllSuggestions(editor).filter(
		(suggestion): suggestion is PersistentTextSuggestion =>
			suggestion.kind === "text" &&
			suggestion.action === "insert" &&
			suggestionIds.includes(suggestion.id),
	);
	if (insertSuggestions.length === 0) {
		return null;
	}
	const blockId = operation.target.anchor.blockId;
	const startOffset = Math.min(
		operation.target.anchor.offset,
		operation.target.focus.offset,
	);
	const insertedLength = insertSuggestions.reduce(
		(totalLength, suggestion) => totalLength + suggestion.length,
		0,
	);
	const endOffset = startOffset + insertedLength;
	if (endOffset <= startOffset) {
		return null;
	}
	return {
		kind: "selection",
		blockId,
		selection: recreateTextSelection(editor, {
			anchor: { blockId, offset: startOffset },
			focus: { blockId, offset: endOffset },
			blockRange: [blockId],
			isMultiBlock: false,
		}),
	};
}
