import { describe, expect, it } from "vitest";
import {
	createEditor,
	FIELD_EDITOR_SLOT_KEY as CORE_FIELD_EDITOR_SLOT_KEY,
} from "@pen/core";
import {
	applyEnterBehavior,
	getLogicalInlineLength,
	mergeBackwardAtBlockStart,
	moveCaretAcrossBlocks,
	normalizeInlineOffset,
	resolveEnterAction,
	splitBlockAtOffset,
	toggleInlineMark,
} from "../field-editor/commands.js";
import { FieldEditorImpl } from "../field-editor/fieldEditorImpl.js";
import { FIELD_EDITOR_SLOT_KEY } from "../constants/fieldEditor.js";

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
}

function getYText(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
): any {
	const adapter = editor.internals.adapter;
	const doc = editor.internals.crdtDoc;
	const ydoc = adapter.raw(doc) as any;
	return ydoc.getMap("blocks").get(blockId)?.get("content");
}

function editorOpts() {
	return { without: ["document-ops", "delta-stream", "undo"] };
}

describe("@pen/react field-editor commands", () => {
	it("toggles an inline mark across a single-block text selection", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello" },
		]);
		editor.selectText(blockId, 0, 5);

		expect(toggleInlineMark(editor, "bold")).toBe(true);
		expect(editor.getBlock(blockId)!.textDeltas()).toEqual([
			{
				insert: "Hello",
				attributes: { bold: true },
			},
		]);

		editor.destroy();
	});

	it("toggles an inline mark across a multi-block selection", () => {
		const editor = createEditor(editorOpts());
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: "Hello",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
			{
				type: "insert-text",
				blockId: secondBlockId,
				offset: 0,
				text: "World",
			},
		]);

		editor.selectTextRange(
			{ blockId: firstBlockId, offset: 1 },
			{ blockId: secondBlockId, offset: 2 },
		);

		expect(toggleInlineMark(editor, "italic")).toBe(true);
		expect(editor.getBlock(firstBlockId)!.textDeltas()).toEqual([
			{ insert: "H" },
			{
				insert: "ello",
				attributes: { italic: true },
			},
		]);
		expect(editor.getBlock(secondBlockId)!.textDeltas()).toEqual([
			{
				insert: "Wo",
				attributes: { italic: true },
			},
			{ insert: "rld" },
		]);

		editor.destroy();
	});

	it("uses pending marks for collapsed rich-text selections", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;
		const fieldEditor = new FieldEditorImpl(editor);
		const ytext = getYText(editor, blockId);

		editor.internals.setSlot(FIELD_EDITOR_SLOT_KEY, fieldEditor);
		editor.internals.setSlot(CORE_FIELD_EDITOR_SLOT_KEY, fieldEditor);
		fieldEditor.activate(blockId);
		fieldEditor.setTextSelection(blockId, 0, 0);

		expect(toggleInlineMark(editor, "bold")).toBe(true);
		expect(fieldEditor.getPendingMarks()).toEqual({ bold: true });
		expect(fieldEditor.resolveInsertMarks(ytext, 0)).toEqual({
			bold: true,
		});

		expect(toggleInlineMark(editor, "bold")).toBe(true);
		expect(fieldEditor.getPendingMarks()).toEqual({});
		expect(fieldEditor.resolveInsertMarks(ytext, 0)).toBeUndefined();

		fieldEditor.destroy();
		editor.destroy();
	});

	it("splits a block and returns the next selection target", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "HelloWorld" },
		]);

		const target = splitBlockAtOffset(editor, { blockId, offset: 5 });

		expect(editor.blockCount()).toBe(2);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"Hello",
		);
		expect(
			visibleText(editor.getBlock(target.blockId)!.textContent()),
		).toBe("World");
		expect(target.anchorOffset).toBe(0);
		expect(target.focusOffset).toBe(0);

		editor.destroy();
	});

	it("uses newline insertion for code input mode", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "codeBlock" },
			{ type: "insert-text", blockId, offset: 0, text: "abcd" },
		]);

		const target = applyEnterBehavior(editor, {
			blockId,
			inputMode: "code",
			ytext: getYText(editor, blockId),
			range: { start: 2, end: 2 },
		});

		expect(editor.blockCount()).toBe(1);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"ab\ncd",
		);
		expect(target).toEqual({ blockId, anchorOffset: 3, focusOffset: 3 });

		editor.destroy();
	});

	it("treats placeholder-only blocks as logically empty", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;
		const ytext = getYText(editor, blockId);

		expect(getLogicalInlineLength(ytext)).toBe(0);
		expect(normalizeInlineOffset(ytext, 1)).toBe(0);

		editor.destroy();
	});

	it("merges backward from an empty block without carrying the placeholder", () => {
		const editor = createEditor(editorOpts());
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: "Hello",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
		]);

		const secondYText = getYText(editor, secondBlockId);
		const target = mergeBackwardAtBlockStart(editor, {
			blockId: secondBlockId,
			ytext: secondYText,
			range: { start: 1, end: 1 },
		});

		expect(target).toEqual({
			blockId: firstBlockId,
			anchorOffset: 5,
			focusOffset: 5,
		});
		expect(editor.blockCount()).toBe(1);
		expect(editor.getBlock(firstBlockId)!.textContent()).toBe("Hello");

		editor.destroy();
	});

	it("moves to the previous block at the logical start", () => {
		const editor = createEditor(editorOpts());
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: "Hello",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
		]);

		const secondYText = getYText(editor, secondBlockId);
		const target = moveCaretAcrossBlocks(editor, {
			blockId: secondBlockId,
			ytext: secondYText,
			range: { start: 1, end: 1 },
			direction: "previous",
		});

		expect(target).toEqual({
			blockId: firstBlockId,
			anchorOffset: 5,
			focusOffset: 5,
		});

		editor.destroy();
	});

	it("moves to the next block at the logical end", () => {
		const editor = createEditor(editorOpts());
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: "Hello",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
		]);

		const firstYText = getYText(editor, firstBlockId);
		const target = moveCaretAcrossBlocks(editor, {
			blockId: firstBlockId,
			ytext: firstYText,
			range: { start: 5, end: 5 },
			direction: "next",
		});

		expect(target).toEqual({
			blockId: secondBlockId,
			anchorOffset: 0,
			focusOffset: 0,
		});

		editor.destroy();
	});
});

describe("resolveEnterAction – schema-aware Enter", () => {
	it("returns split with paragraph type for heading blocks", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "convert-block",
				blockId,
				newType: "heading",
				newProps: { level: 1 },
			},
			{ type: "insert-text", blockId, offset: 0, text: "Title" },
		]);

		const action = resolveEnterAction(
			editor,
			blockId,
			"richtext",
			getYText(editor, blockId),
		);
		expect(action).toEqual({ action: "split", newBlockType: "paragraph" });

		editor.destroy();
	});

	it("converts empty bullet list item to paragraph", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "bulletListItem" },
		]);

		const action = resolveEnterAction(
			editor,
			blockId,
			"richtext",
			getYText(editor, blockId),
		);
		expect(action).toEqual({ action: "convert", newType: "paragraph" });

		editor.destroy();
	});

	it("splits non-empty bullet list item (keeps type)", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "bulletListItem" },
			{ type: "insert-text", blockId, offset: 0, text: "item" },
		]);

		const action = resolveEnterAction(
			editor,
			blockId,
			"richtext",
			getYText(editor, blockId),
		);
		expect(action).toEqual({ action: "split", newBlockType: undefined });

		editor.destroy();
	});

	it("converts empty numbered list item to paragraph", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "numberedListItem" },
		]);

		const action = resolveEnterAction(
			editor,
			blockId,
			"richtext",
			getYText(editor, blockId),
		);
		expect(action).toEqual({ action: "convert", newType: "paragraph" });

		editor.destroy();
	});

	it("converts empty check list item to paragraph", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "checkListItem" },
		]);

		const action = resolveEnterAction(
			editor,
			blockId,
			"richtext",
			getYText(editor, blockId),
		);
		expect(action).toEqual({ action: "convert", newType: "paragraph" });

		editor.destroy();
	});

	it("converts empty blockquote to paragraph", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "blockquote" },
		]);

		const action = resolveEnterAction(
			editor,
			blockId,
			"richtext",
			getYText(editor, blockId),
		);
		expect(action).toEqual({ action: "convert", newType: "paragraph" });

		editor.destroy();
	});

	it("splits non-empty blockquote (keeps type)", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "blockquote" },
			{ type: "insert-text", blockId, offset: 0, text: "quote" },
		]);

		const action = resolveEnterAction(
			editor,
			blockId,
			"richtext",
			getYText(editor, blockId),
		);
		expect(action).toEqual({ action: "split", newBlockType: undefined });

		editor.destroy();
	});

	it("converts empty callout to paragraph", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([{ type: "convert-block", blockId, newType: "callout" }]);

		const action = resolveEnterAction(
			editor,
			blockId,
			"richtext",
			getYText(editor, blockId),
		);
		expect(action).toEqual({ action: "convert", newType: "paragraph" });

		editor.destroy();
	});

	it("returns insert-text for code blocks", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "codeBlock" },
		]);

		const action = resolveEnterAction(
			editor,
			blockId,
			"code",
			getYText(editor, blockId),
		);
		expect(action).toEqual({ action: "insert-text", text: "\n" });

		editor.destroy();
	});

	it("returns null for table mode", () => {
		const action = resolveEnterAction({} as any, "x", "table", {
			length: 0,
			toString: () => "",
		});
		expect(action).toBeNull();
	});

	it("returns null for none mode", () => {
		const action = resolveEnterAction({} as any, "x", "none", {
			length: 0,
			toString: () => "",
		});
		expect(action).toBeNull();
	});

	it("splits paragraph with no newBlockType override", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "hello" },
		]);

		const action = resolveEnterAction(
			editor,
			blockId,
			"richtext",
			getYText(editor, blockId),
		);
		expect(action).toEqual({ action: "split", newBlockType: undefined });

		editor.destroy();
	});
});

describe("applyEnterBehavior – integration", () => {
	it("heading Enter produces a paragraph block", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "convert-block",
				blockId,
				newType: "heading",
				newProps: { level: 2 },
			},
			{ type: "insert-text", blockId, offset: 0, text: "Section" },
		]);

		const target = applyEnterBehavior(editor, {
			blockId,
			inputMode: "richtext",
			ytext: getYText(editor, blockId),
			range: { start: 7, end: 7 },
		});

		expect(target).not.toBeNull();
		expect(editor.blockCount()).toBe(2);
		expect(editor.getBlock(blockId)!.type).toBe("heading");
		expect(editor.getBlock(target!.blockId)!.type).toBe("paragraph");

		editor.destroy();
	});

	it("empty bulletListItem Enter converts to paragraph (no new block)", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "bulletListItem" },
		]);

		const target = applyEnterBehavior(editor, {
			blockId,
			inputMode: "richtext",
			ytext: getYText(editor, blockId),
			range: { start: 0, end: 0 },
		});

		expect(target).not.toBeNull();
		expect(editor.blockCount()).toBe(1);
		expect(target!.blockId).toBe(blockId);
		expect(editor.getBlock(blockId)!.type).toBe("paragraph");

		editor.destroy();
	});

	it("non-empty bulletListItem Enter splits (keeps list type)", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "bulletListItem" },
			{ type: "insert-text", blockId, offset: 0, text: "task" },
		]);

		const target = applyEnterBehavior(editor, {
			blockId,
			inputMode: "richtext",
			ytext: getYText(editor, blockId),
			range: { start: 4, end: 4 },
		});

		expect(target).not.toBeNull();
		expect(editor.blockCount()).toBe(2);
		expect(editor.getBlock(blockId)!.type).toBe("bulletListItem");
		expect(editor.getBlock(target!.blockId)!.type).toBe("bulletListItem");

		editor.destroy();
	});
});
