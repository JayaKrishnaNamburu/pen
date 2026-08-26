import { createHeadlessEditor, defineBlock } from "@input/pen-core";
import type { BlockSchema, DiagnosticEvent, Editor } from "@input/pen-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSchema, defaultSchema } from "@input/pen-schema-default";
import {
	DEFAULT_SEARCH_OPTIONS,
	SEARCH_BUDGET_EXCEEDED_CODE,
	SEARCH_EXECUTION_BUDGET_MS,
	SEARCH_INVALID_PATTERN_CODE,
	SEARCH_QUERY_MAX_LENGTH,
	SEARCH_REGEX_SEGMENT_MAX_CODE_UNITS,
	buildReplaceAllOps,
	buildSearchRegex,
	findDocumentMatches,
} from "../index";
import { getNextActiveIndex, getPreviousActiveIndex } from "../search";

const HOMOGENEOUS_DOCUMENT_CHARS = 100_000;

describe("@input/pen-search helpers", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("SEC9: defaults regex matching to false", () => {
		expect(DEFAULT_SEARCH_OPTIONS.regex).toBe(false);
	});

	it("SEC9: compiles patterns with the u flag and does not throw on invalid regex", () => {
		const literal = buildSearchRegex("hello", DEFAULT_SEARCH_OPTIONS);
		expect(literal?.unicode).toBe(true);

		expect(() =>
			buildSearchRegex("(", {
				...DEFAULT_SEARCH_OPTIONS,
				regex: true,
			}),
		).not.toThrow();
		expect(
			buildSearchRegex("(", {
				...DEFAULT_SEARCH_OPTIONS,
				regex: true,
			}),
		).toBeNull();
	});

	it("SEC9: emits a diagnostic for an invalid regex pattern instead of throwing", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const diagnostics = collectDiagnostics(editor);

		expect(() =>
			findDocumentMatches(editor, "(", {
				...DEFAULT_SEARCH_OPTIONS,
				regex: true,
			}),
		).not.toThrow();

		expect(
			findDocumentMatches(editor, "(", {
				...DEFAULT_SEARCH_OPTIONS,
				regex: true,
			}),
		).toEqual([]);
		expect(diagnostics.some((event) => event.code === SEARCH_INVALID_PATTERN_CODE)).toBe(
			true,
		);

		editor.destroy();
	});

	it("SEC9: caps query length at SEARCH_QUERY_MAX_LENGTH", () => {
		expect(SEARCH_QUERY_MAX_LENGTH).toBe(1_024);

		const editor = createHeadlessEditor({ schema: defaultSchema });
		const diagnostics = collectDiagnostics(editor);
		const query = "a".repeat(SEARCH_QUERY_MAX_LENGTH + 1);

		expect(buildSearchRegex(query, DEFAULT_SEARCH_OPTIONS)).toBeNull();
		expect(findDocumentMatches(editor, query, DEFAULT_SEARCH_OPTIONS)).toEqual([]);
		expect(diagnostics.some((event) => event.code === SEARCH_INVALID_PATTERN_CODE)).toBe(
			true,
		);

		editor.destroy();
	});

	it("SEC9: (a+)+$ against a 100k-char homogeneous document returns within budget with the diagnostic", () => {
		const editor = createHomogeneousDocument();
		const diagnostics = collectDiagnostics(editor);
		const origin = performance.now();
		let nowReads = 0;

		vi.spyOn(performance, "now").mockImplementation(() => {
			nowReads += 1;
			if (nowReads <= 3) {
				return origin + nowReads;
			}
			return origin + SEARCH_EXECUTION_BUDGET_MS + 1;
		});

		const startedAt = Date.now();
		// SEC9 probe. Built from parts so this file does not contain a static ReDoS literal.
		const nestedRepeater = ["(", "a+", ")", "+", "$"].join("");
		const matches = findDocumentMatches(editor, nestedRepeater, {
			...DEFAULT_SEARCH_OPTIONS,
			regex: true,
		});
		const elapsedMs = Date.now() - startedAt;

		expect(SEARCH_REGEX_SEGMENT_MAX_CODE_UNITS).toBe(64 * 1_024);
		expect(elapsedMs).toBeLessThan(1_000);
		expect(matches.length).toBeGreaterThan(0);
		expect(
			diagnostics.some((event) => event.code === SEARCH_BUDGET_EXCEEDED_CODE),
		).toBe(true);

		editor.destroy();
	});

	it("SEC9: a literal query over the same 100k-char document completes unbudgeted", () => {
		const editor = createHomogeneousDocument();
		const diagnostics = collectDiagnostics(editor);
		const query = "a".repeat(SEARCH_QUERY_MAX_LENGTH);

		const startedAt = Date.now();
		const matches = findDocumentMatches(editor, query, DEFAULT_SEARCH_OPTIONS);
		const elapsedMs = Date.now() - startedAt;

		expect(elapsedMs).toBeLessThan(1_000);
		expect(matches.length).toBeGreaterThan(0);
		expect(
			diagnostics.some((event) => event.code === SEARCH_BUDGET_EXCEEDED_CODE),
		).toBe(false);

		editor.destroy();
	});

	it("LOC4: whole-word search matches a Thai word, not a clause substring", () => {
		const editor = createDocumentWithText("ฉันกินข้าว");
		const wholeWord = {
			...DEFAULT_SEARCH_OPTIONS,
			wholeWord: true,
			locale: "th",
		};

		const wordMatches = findDocumentMatches(editor, "กิน", wholeWord);
		expect(wordMatches).toHaveLength(1);
		expect(wordMatches[0]).toMatchObject({
			from: 3,
			to: 6,
			text: "กิน",
		});

		expect(findDocumentMatches(editor, "กินข", wholeWord)).toHaveLength(0);
		expect(
			findDocumentMatches(editor, "กินข", DEFAULT_SEARCH_OPTIONS),
		).toHaveLength(1);

		editor.destroy();
	});

	it("LOC4: whole-word search matches accented Latin as one word", () => {
		const editor = createDocumentWithText(
			"the café is open and cafés nearby",
		);
		const wholeWord = {
			...DEFAULT_SEARCH_OPTIONS,
			wholeWord: true,
		};

		const matches = findDocumentMatches(editor, "café", wholeWord);
		expect(matches).toHaveLength(1);
		expect(matches[0]).toMatchObject({
			from: 4,
			to: 8,
			text: "café",
		});

		expect(
			buildSearchRegex("café", wholeWord)?.source.includes("\\b"),
		).toBe(false);

		editor.destroy();
	});

	it("LOC5: case-insensitive search uses foldAndNormalize and skips folding when sensitive", () => {
		const editor = createDocumentWithText("Visit the CAFÉ and cafe\u0301");

		const insensitive = findDocumentMatches(
			editor,
			"café",
			DEFAULT_SEARCH_OPTIONS,
		);
		expect(insensitive).toHaveLength(2);
		expect(insensitive.map((match) => [match.from, match.to])).toEqual([
			[10, 14],
			[19, 24],
		]);

		expect(
			findDocumentMatches(editor, "café", {
				...DEFAULT_SEARCH_OPTIONS,
				caseSensitive: true,
			}),
		).toHaveLength(0);

		editor.destroy();
	});

	it("LOC5: omitted options.locale folds with the editor locale facet", () => {
		const turkish = createDocumentWithText("Istanbul", { locale: "tr" });
		const english = createDocumentWithText("Istanbul", { locale: "en" });

		expect(
			findDocumentMatches(turkish, "ıstanbul", DEFAULT_SEARCH_OPTIONS),
		).toHaveLength(1);
		expect(
			findDocumentMatches(english, "ıstanbul", DEFAULT_SEARCH_OPTIONS),
		).toHaveLength(0);

		turkish.destroy();
		english.destroy();
	});

	it("LOC5: Turkish İ/i and I/ı are distinct pairs under locale tr", () => {
		const dotted = createDocumentWithText("İ", { locale: "tr" });
		const capitalI = createDocumentWithText("I", { locale: "tr" });

		expect(
			findDocumentMatches(dotted, "i", DEFAULT_SEARCH_OPTIONS),
		).toHaveLength(1);
		expect(
			findDocumentMatches(dotted, "ı", DEFAULT_SEARCH_OPTIONS),
		).toHaveLength(0);

		expect(
			findDocumentMatches(capitalI, "ı", DEFAULT_SEARCH_OPTIONS),
		).toHaveLength(1);
		expect(
			findDocumentMatches(capitalI, "i", DEFAULT_SEARCH_OPTIONS),
		).toHaveLength(0);

		dotted.destroy();
		capitalI.destroy();
	});

	it("finds matches in nested children that are absent from blockOrder", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: "parent",
					blockType: "toggle",
					props: { open: true },
					position: "last",
				},
				{
					type: "insert-block",
					blockId: "nested-child",
					blockType: "paragraph",
					props: {},
					position: { parent: "parent", index: 0 },
				},
				{
					type: "splice-text",
					blockId: "nested-child",
					from: 0,
				to: 0,
				insert: "hidden nested match",
				},
			],
			{ origin: "user" },
		);

		expect(editor.documentState.blockOrder).toContain("parent");
		expect(editor.documentState.blockOrder).not.toContain("nested-child");
		expect(
			[...editor.documentState.allBlocks()].map((block) => block.id),
		).toContain("nested-child");

		const matches = findDocumentMatches(
			editor,
			"nested",
			DEFAULT_SEARCH_OPTIONS,
		);
		expect(matches).toHaveLength(1);
		expect(matches[0]).toMatchObject({
			kind: "block",
			blockId: "nested-child",
			text: "nested",
		});

		editor.destroy();
	});

	it("finds matches in layout children that are absent from blockOrder", () => {
		const columns = defineBlock("columns", {
			content: [],
			isContainer: true,
			layout: {
				modes: ["flex"],
				defaultMode: "flex",
				minChildren: 2,
			},
		});
		const editor = createHeadlessEditor({
			schema: createDefaultSchema().extend([
				columns as unknown as BlockSchema,
			]),
		});

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: "cols",
					blockType: "columns",
					props: {},
					position: "last",
				},
				{
					type: "insert-block",
					blockId: "left",
					blockType: "paragraph",
					props: {},
					position: { parent: "cols", index: 0 },
				},
				{
					type: "insert-block",
					blockId: "right",
					blockType: "paragraph",
					props: {},
					position: { parent: "cols", index: 1 },
				},
				{
					type: "splice-text",
					blockId: "left",
					from: 0,
				to: 0,
				insert: "hidden layout match",
				},
				{
					type: "splice-text",
					blockId: "right",
					from: 0,
				to: 0,
				insert: "other column",
				},
			],
			{ origin: "user" },
		);

		expect(editor.documentState.blockOrder).toContain("cols");
		expect(editor.documentState.blockOrder).not.toContain("left");
		expect(editor.documentState.blockOrder).not.toContain("right");

		const matches = findDocumentMatches(
			editor,
			"layout",
			DEFAULT_SEARCH_OPTIONS,
		);
		expect(matches).toHaveLength(1);
		expect(matches[0]).toMatchObject({
			kind: "block",
			blockId: "left",
			text: "layout",
		});

		editor.destroy();
	});

	it("wraps navigation indices", () => {
		expect(getNextActiveIndex(-1, 3)).toBe(0);
		expect(getNextActiveIndex(2, 3)).toBe(0);
		expect(getPreviousActiveIndex(0, 3)).toBe(2);
		expect(getPreviousActiveIndex(-1, 3)).toBe(2);
	});

	it("builds replace-all ops in descending block offsets", () => {
		const ops = buildReplaceAllOps(
			[
				{ kind: "block", blockId: "b1", from: 1, to: 2, text: "a", index: 0 },
				{ kind: "block", blockId: "b1", from: 4, to: 5, text: "a", index: 1 },
				{ kind: "block", blockId: "b2", from: 0, to: 1, text: "a", index: 2 },
			],
			"z",
		);

		expect(ops).toMatchObject([
			{ type: "splice-text", blockId: "b1", from: 4,
				to: 4 + 1 , insert: "" },
			{ type: "splice-text", blockId: "b1", from: 4,
				to: 4,
				insert: "z" },
			{ type: "splice-text", blockId: "b1", from: 1,
				to: 1 + 1 , insert: "" },
			{ type: "splice-text", blockId: "b1", from: 1,
				to: 1,
				insert: "z" },
			{ type: "splice-text", blockId: "b2", from: 0,
				to: 0 + 1 , insert: "" },
			{ type: "splice-text", blockId: "b2", from: 0,
				to: 0,
				insert: "z" },
		]);
	});

});

function collectDiagnostics(editor: Editor): DiagnosticEvent[] {
	const diagnostics: DiagnosticEvent[] = [];
	editor.on("diagnostic", (event) => {
		diagnostics.push(event);
	});
	return diagnostics;
}

function createHomogeneousDocument(): Editor {
	return createDocumentWithText("a".repeat(HOMOGENEOUS_DOCUMENT_CHARS));
}

function createDocumentWithText(
	text: string,
	options: { locale?: string } = {},
): Editor {
	const editor = createHeadlessEditor({
		schema: defaultSchema,
		locale: options.locale,
	});
	const blockId = editor.firstBlock()!.id;
	editor.apply(
		[
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: text,
			},
		],
		{ origin: "user" },
	);
	return editor;
}
