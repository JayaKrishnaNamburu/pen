import {
	createHeadlessEditor,
	foldAndNormalize,
	wordRangeAt,
} from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { defaultSchema } from "@input/pen-schema-default";
import {
	DEFAULT_SEARCH_OPTIONS,
	buildSearchRegex,
	findDocumentMatches,
} from "../index";

describe("@input/pen-search LOC4 leftovers", () => {
	it("LOC4: whole-word search matches a Thai word, not a clause substring", () => {
		const text = "ฉันกินข้าว";
		const editor = createDocumentWithText(text);
		const wholeWord = {
			...DEFAULT_SEARCH_OPTIONS,
			wholeWord: true,
			locale: "th",
		};

		const word = wordRangeAt(text, 4, "th");
		expect(word).toEqual({ start: 3, end: 6 });

		const wordMatches = findDocumentMatches(editor, "กิน", wholeWord);
		expect(wordMatches).toHaveLength(1);
		expect(wordMatches[0]).toMatchObject({
			from: word?.start,
			to: word?.end,
			text: "กิน",
		});

		expect(findDocumentMatches(editor, "กินข", wholeWord)).toHaveLength(0);
		expect(
			findDocumentMatches(editor, "กินข", DEFAULT_SEARCH_OPTIONS),
		).toHaveLength(1);

		editor.destroy();
	});

	it("LOC4: case-insensitive search uses foldAndNormalize and skips folding when sensitive", () => {
		expect(foldAndNormalize("I", "tr")).toBe(foldAndNormalize("ı", "tr"));
		expect(foldAndNormalize("Café", "en")).toBe(
			foldAndNormalize("cafe\u0301", "en"),
		);

		const editor = createDocumentWithText("Istanbul CAFÉ cafe\u0301");
		const turkish = {
			...DEFAULT_SEARCH_OPTIONS,
			locale: "tr",
		};

		const istanbul = findDocumentMatches(editor, "ıstanbul", turkish);
		expect(istanbul).toHaveLength(1);
		expect(istanbul[0]).toMatchObject({ from: 0, to: 8, text: "Istanbul" });

		expect(
			findDocumentMatches(editor, "ıstanbul", {
				...turkish,
				caseSensitive: true,
			}),
		).toHaveLength(0);

		const cafe = findDocumentMatches(editor, "café", DEFAULT_SEARCH_OPTIONS);
		expect(cafe).toHaveLength(2);
		expect(cafe.map((match) => [match.from, match.to])).toEqual([
			[9, 13],
			[14, 19],
		]);

		expect(
			findDocumentMatches(editor, "café", {
				...DEFAULT_SEARCH_OPTIONS,
				caseSensitive: true,
			}),
		).toHaveLength(0);

		expect(
			buildSearchRegex("café", DEFAULT_SEARCH_OPTIONS)?.source.includes("\\b"),
		).toBe(false);

		editor.destroy();
	});
});

function createDocumentWithText(text: string): Editor {
	const editor = createHeadlessEditor({ schema: defaultSchema });
	const blockId = editor.firstBlock()!.id;
	editor.apply(
		[
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text,
			},
		],
		{ origin: "user" },
	);
	return editor;
}
