import { createHeadlessEditor } from "@input/pen-core";
import type { DiagnosticEvent, Editor } from "@input/pen-types";
import { afterEach, describe, expect, it, vi } from "vitest";
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
	getNextActiveIndex,
	getPreviousActiveIndex,
} from "../index";

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
		const editor = createHeadlessEditor();
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

		const editor = createHeadlessEditor();
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
		const matches = findDocumentMatches(editor, "(a+)+$", {
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
			{ type: "delete-text", blockId: "b1", offset: 4, length: 1 },
			{ type: "insert-text", blockId: "b1", offset: 4, text: "z" },
			{ type: "delete-text", blockId: "b1", offset: 1, length: 1 },
			{ type: "insert-text", blockId: "b1", offset: 1, text: "z" },
			{ type: "delete-text", blockId: "b2", offset: 0, length: 1 },
			{ type: "insert-text", blockId: "b2", offset: 0, text: "z" },
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

function createDocumentWithText(text: string): Editor {
	const editor = createHeadlessEditor();
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
