import type { ApplyOptions, DocumentOp, Editor } from "@input/pen-types";
import { describe, expect, it, vi } from "vitest";
import { defaultSchema } from "./fixtures/testSchema";
import { retrieveDocumentSpans } from "../utils/retrieveDocumentSpans";
import { searchDocumentTool } from "../tools/searchDocument";

const TURKISH_DOTTED_CAPITAL_I = "I";
const TURKISH_DOTLESS_I = "ı";
const TURKISH_DOCUMENT_TEXT = `${TURKISH_DOTTED_CAPITAL_I}şık`;
const TURKISH_QUERY = `${TURKISH_DOTLESS_I}şık`;

function createLocaleEditor(locale: string, text: string): Editor {
	const block = {
		id: "block-1",
		type: "paragraph",
		props: {},
		children: [],
		textContent: () => text,
		textDeltas: () => [{ insert: text }],
		tableRowCount: () => 0,
		tableColumnCount: () => 0,
		tableCell: () => null,
		tableRow: () => null,
		tableColumns: () => [],
		as: () => null,
	};

	return {
		documentProfile: "structured",
		schema: defaultSchema,
		apply: vi.fn<(ops: DocumentOp[], options?: ApplyOptions) => void>(),
		blocks: () => [block],
		getBlock: (blockId: string) => (blockId === block.id ? block : null),
		documentState: {
			allBlocks: () => [block],
		},
		facet: () => locale,
		getSelection: () => ({
			type: "text",
			anchor: { blockId: block.id, offset: 0 },
			focus: { blockId: block.id, offset: text.length },
		}),
		getSelectedText: () => text,
	} as unknown as Editor;
}

describe("LOC5 document-ops folding", () => {
	it("LOC5: Turkish ı matches dotted I only when both sides use foldAndNormalize", async () => {
		expect(TURKISH_DOCUMENT_TEXT.toLowerCase()).not.toBe(
			TURKISH_QUERY.toLowerCase(),
		);

		const editor = createLocaleEditor("tr", TURKISH_DOCUMENT_TEXT);
		const matches = (await searchDocumentTool(editor).handler(
			{ query: TURKISH_QUERY },
			{} as never,
		)) as Array<{ blockId: string; offset: number; length: number }>;

		expect(matches).toEqual([
			expect.objectContaining({
				blockId: "block-1",
				offset: 0,
				length: TURKISH_QUERY.length,
			}),
		]);

		const spans = retrieveDocumentSpans(editor, {
			query: TURKISH_QUERY,
		});
		expect(spans[0]?.blockIds).toContain("block-1");
		expect(spans[0]?.score).toBeGreaterThan(0);

		expect(
			await searchDocumentTool(editor).handler(
				{ query: TURKISH_QUERY, caseSensitive: true },
				{} as never,
			),
		).toEqual([]);

		const englishEditor = createLocaleEditor("en", TURKISH_DOCUMENT_TEXT);
		expect(
			await searchDocumentTool(englishEditor).handler(
				{ query: TURKISH_QUERY },
				{} as never,
			),
		).toEqual([]);
	});
});
