import { describe, expect, it } from "vitest";
import { buildAISuggestionDecorations } from "../decorations";
import type { AISuggestion } from "../types";

function suggestion(overrides: Partial<AISuggestion> = {}): AISuggestion {
	return {
		id: "suggestion-1",
		kind: "spelling",
		title: "Spelling",
		blockId: "block-1",
		from: 0,
		to: 3,
		originalText: "Ths",
		replacementText: "This",
		scopeId: "scope-1",
		scopeHash: "hash-1",
		createdAt: 0,
		invalidated: false,
		...overrides,
	};
}

describe("HOST6 AI suggestion decorations", () => {
	it("HOST6 reads --pen-ai-suggestion-line with a default instead of writing it", () => {
		const [decoration] = buildAISuggestionDecorations([suggestion()], null);

		expect(decoration).toBeDefined();
		expect(decoration?.attributes.class).toContain(
			"pen-ai-suggestion-underline",
		);
		expect(decoration?.attributes.style).toBeUndefined();
	});

	it("HOST6 active decorations keep the same overridable line token", () => {
		const [decoration] = buildAISuggestionDecorations(
			[suggestion()],
			"suggestion-1",
		);

		expect(decoration?.attributes.class).toContain(
			"pen-ai-suggestion-underline",
		);
		expect(decoration?.attributes.class).toContain(
			"pen-ai-suggestion-active",
		);
		expect(decoration?.attributes.style).toBeUndefined();
	});
});
