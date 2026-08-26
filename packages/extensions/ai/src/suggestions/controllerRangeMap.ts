import {
	deriveContentMoves,
	repairAnchor,
	type ContentMove,
} from "@input/pen-core";
import type { AnchorRange, ChangeSummary, Editor } from "@input/pen-types";
import type { AISuggestion } from "./types";

export function mapSuggestionsThroughSummary(input: {
	editor: Editor;
	ranges: Map<string, AnchorRange>;
	suggestions: readonly AISuggestion[];
	activeSuggestionId: string | null;
	activeSuggestionGroupId: string | null;
	summary: ChangeSummary;
}): {
	suggestions: AISuggestion[];
	activeSuggestionId: string | null;
	activeSuggestionGroupId: string | null;
} | null {
	if (input.suggestions.length === 0) {
		return null;
	}

	const moves = deriveContentMoves(input.summary, undefined);
	let changed = false;
	const nextSuggestions: AISuggestion[] = [];
	for (const suggestion of input.suggestions) {
		if (suggestion.invalidated) {
			nextSuggestions.push(suggestion);
			continue;
		}

		const synced = syncSuggestionRange(
			input.editor,
			input.ranges,
			suggestion,
			moves,
		);
		if (synced.kind === "dead") {
			input.ranges.delete(suggestion.id);
			changed = true;
			continue;
		}
		if (synced.kind === "retry") {
			nextSuggestions.push(suggestion);
			continue;
		}
		if (
			synced.blockId !== suggestion.blockId ||
			synced.from !== suggestion.from ||
			synced.to !== suggestion.to
		) {
			changed = true;
			nextSuggestions.push({
				...suggestion,
				blockId: synced.blockId,
				from: synced.from,
				to: synced.to,
			});
			continue;
		}

		nextSuggestions.push(suggestion);
	}

	if (!changed) {
		return null;
	}

	const activeStillPresent =
		input.activeSuggestionId != null &&
		nextSuggestions.some(
			(suggestion) => suggestion.id === input.activeSuggestionId,
		);
	return {
		suggestions: nextSuggestions,
		activeSuggestionId: activeStillPresent
			? input.activeSuggestionId
			: null,
		activeSuggestionGroupId: activeStillPresent
			? input.activeSuggestionGroupId
			: null,
	};
}

function retargetThroughMerge(
	editor: Editor,
	suggestion: AISuggestion,
	moves: readonly ContentMove[],
): { blockId: string; from: number; to: number } | null {
	for (const move of moves) {
		if (move.fromBlockId !== suggestion.blockId) {
			continue;
		}
		if (move.fromRange.from !== 0) {
			continue;
		}
		if (editor.getBlock(suggestion.blockId)) {
			continue;
		}
		return {
			blockId: move.toBlockId,
			from: move.toOffset + suggestion.from,
			to: move.toOffset + suggestion.to,
		};
	}
	return null;
}

function syncSuggestionRange(
	editor: Editor,
	ranges: Map<string, AnchorRange>,
	suggestion: AISuggestion,
	moves: readonly ContentMove[],
):
	| { kind: "live"; blockId: string; from: number; to: number }
	| { kind: "retry" }
	| { kind: "dead" } {
	let range = ranges.get(suggestion.id) ?? null;
	if (!range) {
		range = editor.anchors.range({
			anchor: {
				blockId: suggestion.blockId,
				offset: suggestion.from,
			},
			focus: {
				blockId: suggestion.blockId,
				offset: suggestion.to,
			},
		});
		if (!range) {
			return { kind: "dead" };
		}
		ranges.set(suggestion.id, range);
	}

	const from = repairAnchor(editor, range.from, moves);
	const to = repairAnchor(editor, range.to, moves);
	if (from !== range.from || to !== range.to) {
		range = { kind: "anchor-range", from, to };
		ranges.set(suggestion.id, range);
	}

	const merged = retargetThroughMerge(editor, suggestion, moves);
	if (merged) {
		const reminted = editor.anchors.range({
			anchor: { blockId: merged.blockId, offset: merged.from },
			focus: { blockId: merged.blockId, offset: merged.to },
		});
		if (reminted) {
			ranges.set(suggestion.id, reminted);
		}
		return { kind: "live", ...merged };
	}

	const resolved = editor.anchors.resolveRange(range);
	if (!resolved) {
		if (
			editor.getBlock(range.from.blockId) ||
			editor.getBlock(range.to.blockId) ||
			editor.getBlock(suggestion.blockId)
		) {
			return { kind: "retry" };
		}
		return { kind: "dead" };
	}
	if (resolved.collapsed) {
		return { kind: "dead" };
	}
	if (resolved.from.blockId !== resolved.to.blockId) {
		return { kind: "dead" };
	}
	const nextFrom = Math.min(resolved.from.offset, resolved.to.offset);
	const nextTo = Math.max(resolved.from.offset, resolved.to.offset);
	if (nextFrom === nextTo) {
		return { kind: "dead" };
	}
	return {
		kind: "live",
		blockId: resolved.from.blockId,
		from: nextFrom,
		to: nextTo,
	};
}
