import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { buildApplySuggestionOps } from "../apply";
import type { AISuggestion } from "../types";
import { defaultSchema } from "@input/pen-schema";

describe("@input/pen-ai/suggestions apply", () => {
	it("builds replace-text ops when the source text still matches", () => {
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "Ths is good.",
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
				type: "splice-text",
				blockId,
				from: 0,
				to: 0 + 3,
				insert: "This",
			},
		]);

		editor.destroy();
	});
});
