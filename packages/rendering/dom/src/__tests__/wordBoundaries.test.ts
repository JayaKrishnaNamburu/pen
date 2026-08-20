import { describe, expect, it, vi } from "vitest";
import {
	nextGraphemeBoundary,
	nextWordBoundary,
	previousGraphemeBoundary,
	previousWordBoundary,
} from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { DIRECT_HANDLERS } from "../field-editor/contenteditableDirectHandlers";
import type { ContentEditableDirectInputBackend } from "../field-editor/contenteditableDirectHandlers";
import type { FieldEditorInputController } from "../field-editor/controller";
import type { FieldEditorTextLike } from "../field-editor/crdt";

const JAPANESE = "今日は良い天気です";
const THAI = "ฉันกินข้าว";

function createHarness(options: {
	text: string;
	offset: number;
	locale: string;
}): {
	editor: Editor;
	ytext: FieldEditorTextLike;
	fieldEditor: FieldEditorInputController;
	backend: ContentEditableDirectInputBackend;
	applyInlineTextEdit: ReturnType<typeof vi.fn>;
} {
	const applyInlineTextEdit = vi.fn();
	const editor = {
		selection: null,
		getBlock: () => null,
		internals: {
			getSlot: (key: string) =>
				key === "pen.locale" ? options.locale : undefined,
		},
	} as unknown as Editor;
	const ytext = {
		length: options.text.length,
		toString: () => options.text,
	} as FieldEditorTextLike;
	const fieldEditor = {
		focusBlockId: "block-1",
	} as FieldEditorInputController;
	const backend: ContentEditableDirectInputBackend = {
		resolveCurrentInputRange: () => ({
			start: options.offset,
			end: options.offset,
		}),
		applyListInputRule: () => false,
		applyInlineTextEdit,
	};

	return { editor, ytext, fieldEditor, backend, applyInlineTextEdit };
}

function deletedRange(
	applyInlineTextEdit: ReturnType<typeof vi.fn>,
): { start: number; end: number } | null {
	const call = applyInlineTextEdit.mock.calls[0] as
		| [{ range: { start: number; end: number } }]
		| undefined;
	return call?.[0]?.range ?? null;
}

describe("field-editor word and grapheme delete (LOC4)", () => {
	it("LOC4: Japanese word delete backward removes a word, not a clause", () => {
		const offset = JAPANESE.length;
		const start = previousWordBoundary(JAPANESE, offset, "ja");
		expect(JAPANESE.slice(start, offset)).toBe("です");
		expect(start).toBeGreaterThan(0);

		const harness = createHarness({
			text: JAPANESE,
			offset,
			locale: "ja",
		});
		DIRECT_HANDLERS.deleteWordBackward(
			{} as InputEvent,
			harness.editor,
			harness.ytext,
			harness.fieldEditor,
			{} as HTMLElement,
			harness.backend,
		);

		expect(deletedRange(harness.applyInlineTextEdit)).toEqual({
			start,
			end: offset,
		});
	});

	it("LOC4: Japanese word delete forward removes a word, not a clause", () => {
		const end = nextWordBoundary(JAPANESE, 0, "ja");
		expect(JAPANESE.slice(0, end)).toBe("今日");
		expect(end).toBeLessThan(JAPANESE.length);

		const harness = createHarness({
			text: JAPANESE,
			offset: 0,
			locale: "ja",
		});
		DIRECT_HANDLERS.deleteWordForward(
			{} as InputEvent,
			harness.editor,
			harness.ytext,
			harness.fieldEditor,
			{} as HTMLElement,
			harness.backend,
		);

		expect(deletedRange(harness.applyInlineTextEdit)).toEqual({
			start: 0,
			end,
		});
	});

	it("LOC4: Thai word delete backward removes a word, not a clause", () => {
		const offset = THAI.length;
		const start = previousWordBoundary(THAI, offset, "th");
		expect(THAI.slice(start, offset)).toBe("ข้าว");
		expect(start).toBeGreaterThan(0);

		const harness = createHarness({
			text: THAI,
			offset,
			locale: "th",
		});
		DIRECT_HANDLERS.deleteWordBackward(
			{} as InputEvent,
			harness.editor,
			harness.ytext,
			harness.fieldEditor,
			{} as HTMLElement,
			harness.backend,
		);

		expect(deletedRange(harness.applyInlineTextEdit)).toEqual({
			start,
			end: offset,
		});
	});

	it("LOC4: Thai word delete forward removes a word, not a clause", () => {
		const end = nextWordBoundary(THAI, 0, "th");
		expect(THAI.slice(0, end)).toBe("ฉัน");
		expect(end).toBeLessThan(THAI.length);

		const harness = createHarness({
			text: THAI,
			offset: 0,
			locale: "th",
		});
		DIRECT_HANDLERS.deleteWordForward(
			{} as InputEvent,
			harness.editor,
			harness.ytext,
			harness.fieldEditor,
			{} as HTMLElement,
			harness.backend,
		);

		expect(deletedRange(harness.applyInlineTextEdit)).toEqual({
			start: 0,
			end,
		});
	});

	it("LOC4 F2: character delete backward removes a grapheme, not a code unit", () => {
		const text = "hi😀";
		const offset = text.length;
		const start = previousGraphemeBoundary(text, offset, "en");
		expect(start).toBe(2);

		const harness = createHarness({ text, offset, locale: "en" });
		DIRECT_HANDLERS.deleteContentBackward(
			{} as InputEvent,
			harness.editor,
			harness.ytext,
			harness.fieldEditor,
			{} as HTMLElement,
			harness.backend,
		);

		expect(deletedRange(harness.applyInlineTextEdit)).toEqual({
			start,
			end: offset,
		});
	});

	it("LOC4 F2: character delete forward removes a grapheme, not a code unit", () => {
		const text = "😀hi";
		const end = nextGraphemeBoundary(text, 0, "en");
		expect(end).toBe(2);

		const harness = createHarness({ text, offset: 0, locale: "en" });
		DIRECT_HANDLERS.deleteContentForward(
			{} as InputEvent,
			harness.editor,
			harness.ytext,
			harness.fieldEditor,
			{} as HTMLElement,
			harness.backend,
		);

		expect(deletedRange(harness.applyInlineTextEdit)).toEqual({
			start: 0,
			end,
		});
	});
});
