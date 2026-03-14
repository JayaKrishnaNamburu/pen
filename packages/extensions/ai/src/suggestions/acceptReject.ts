import type { DocumentOp, Editor } from "@pen/core";
import {
	readAllSuggestions,
	readBlockSuggestionMeta,
	readSuggestionsFromBlock,
} from "./persistent";
import { SUGGESTION_RESOLUTION_ORIGIN } from "./suggestMode";

const RESOLUTION_ORIGIN = SUGGESTION_RESOLUTION_ORIGIN;

export function acceptSuggestion(editor: Editor, suggestionId: string): boolean {
	if (!isSuggestionPending(editor, suggestionId)) return false;
	const ops = buildAcceptOps(editor, suggestionId);
	if (ops.length === 0) return false;
	editor.apply(ops, { origin: RESOLUTION_ORIGIN });
	return true;
}

export function rejectSuggestion(editor: Editor, suggestionId: string): boolean {
	if (!isSuggestionPending(editor, suggestionId)) return false;
	const ops = buildRejectOps(editor, suggestionId);
	if (ops.length === 0) return false;
	editor.apply(ops, { origin: RESOLUTION_ORIGIN });
	return true;
}

export function acceptAllSuggestions(editor: Editor): void {
	for (const id of getAllSuggestionIds(editor)) {
		acceptSuggestion(editor, id);
	}
}

export function rejectAllSuggestions(editor: Editor): void {
	for (const id of getAllSuggestionIds(editor)) {
		rejectSuggestion(editor, id);
	}
}

function isSuggestionPending(editor: Editor, suggestionId: string): boolean {
	for (const block of editor.documentState.allBlocks()) {
		const blockSuggestion = readBlockSuggestionMeta(block);
		if (blockSuggestion?.id === suggestionId) {
			return true;
		}
		if (readSuggestionsFromBlock(editor, block.id).some((item) => item.id === suggestionId)) {
			return true;
		}
	}
	return false;
}

function buildAcceptOps(editor: Editor, suggestionId: string): DocumentOp[] {
	for (const block of editor.documentState.allBlocks()) {
		const blockSuggestion = readBlockSuggestionMeta(block);
		if (blockSuggestion?.id === suggestionId) {
			switch (blockSuggestion.action) {
				case "insert-block":
				case "move-block":
				case "convert-block":
					return [{
						type: "set-meta",
						blockId: block.id,
						namespace: "suggestion",
						data: null,
					}];
				case "delete-block":
					return [{ type: "delete-block", blockId: block.id }];
			}
		}

		const matches = readSuggestionsFromBlock(editor, block.id)
			.filter((item) => item.id === suggestionId)
			.sort((left, right) => right.offset - left.offset);
		if (matches.length === 0) continue;

		const ops: DocumentOp[] = [];
		for (const suggestion of matches) {
			if (suggestion.action === "insert") {
				ops.push({
					type: "format-text",
					blockId: block.id,
					offset: suggestion.offset,
					length: suggestion.length,
					marks: { suggestion: null },
				});
				continue;
			}
			ops.push({
				type: "delete-text",
				blockId: block.id,
				offset: suggestion.offset,
				length: suggestion.length,
			});
		}
		return ops;
	}

	return [];
}

function buildRejectOps(editor: Editor, suggestionId: string): DocumentOp[] {
	for (const block of editor.documentState.allBlocks()) {
		const blockSuggestion = readBlockSuggestionMeta(block);
		if (blockSuggestion?.id === suggestionId) {
			switch (blockSuggestion.action) {
				case "insert-block":
					return [{ type: "delete-block", blockId: block.id }];
				case "delete-block":
					return [{
						type: "set-meta",
						blockId: block.id,
						namespace: "suggestion",
						data: null,
					}];
				case "move-block":
					return blockSuggestion.previousState?.position
						? [
								{
									type: "move-block",
									blockId: block.id,
									position: blockSuggestion.previousState.position,
								},
								{
									type: "set-meta",
									blockId: block.id,
									namespace: "suggestion",
									data: null,
								},
						  ]
						: [{
								type: "set-meta",
								blockId: block.id,
								namespace: "suggestion",
								data: null,
						  }];
				case "convert-block":
					return blockSuggestion.previousState?.type
						? [
								{
									type: "convert-block",
									blockId: block.id,
									newType: blockSuggestion.previousState.type,
									newProps: blockSuggestion.previousState.props ?? {},
								},
								{
									type: "set-meta",
									blockId: block.id,
									namespace: "suggestion",
									data: null,
								},
						  ]
						: [{
								type: "set-meta",
								blockId: block.id,
								namespace: "suggestion",
								data: null,
						  }];
			}
		}

		const matches = readSuggestionsFromBlock(editor, block.id)
			.filter((item) => item.id === suggestionId)
			.sort((left, right) => right.offset - left.offset);
		if (matches.length === 0) continue;

		const ops: DocumentOp[] = [];
		for (const suggestion of matches) {
			if (suggestion.action === "insert") {
				ops.push({
					type: "delete-text",
					blockId: block.id,
					offset: suggestion.offset,
					length: suggestion.length,
				});
				continue;
			}
			ops.push({
				type: "format-text",
				blockId: block.id,
				offset: suggestion.offset,
				length: suggestion.length,
				marks: { suggestion: null },
			});
		}
		return ops;
	}

	return [];
}

function getAllSuggestionIds(editor: Editor): string[] {
	const ids = new Set<string>();
	for (const suggestion of readAllSuggestions(editor)) {
		ids.add(suggestion.id);
	}
	for (const block of editor.documentState.allBlocks()) {
		const meta = readBlockSuggestionMeta(block);
		if (meta?.id) {
			ids.add(meta.id);
		}
	}
	return [...ids];
}
