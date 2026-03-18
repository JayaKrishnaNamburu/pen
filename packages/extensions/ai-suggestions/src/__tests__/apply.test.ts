import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import { buildApplySuggestionOps } from "../apply";
import type { AISuggestion } from "../types";

describe("@pen/ai-suggestions apply", () => {
	it("builds replace-text ops when the source text still matches", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "Ths is good.",
			},
		]);

		const suggestion: AISuggestion = {
			id: "suggestion-1",
			kind: "spelling",
			title: "Spelling",
			blockId,
			from: 0,
			to: 3,
			originalText: "Ths",
			replacementText: "This",
			scopeId: "scope-1",
			scopeHash: "hash-1",
			createdAt: Date.now(),
			invalidated: false,
		};

		expect(buildApplySuggestionOps(editor, suggestion)).toEqual([
			{
				type: "replace-text",
				blockId,
				offset: 0,
				length: 3,
				text: "This",
			},
		]);

		editor.destroy();
	});
});
