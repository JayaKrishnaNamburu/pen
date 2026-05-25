import { describe, expect, it } from "vitest";
import { createEditor, getNumberedListItemValue } from "@pen/core";
import {
	FIELD_EDITOR_SLOT_KEY as CORE_FIELD_EDITOR_SLOT_KEY,
	INPUT_RULES_ENGINE_SLOT_KEY,
} from "@pen/types";
import { defaultPreset } from "@pen/preset-default";
import {
	applyDeleteBehavior,
	applyListInputRule,
	applyBackspaceBehavior,
	applyEnterBehavior,
	applyListTabBehavior,
	getLogicalInlineLength,
	moveCaretAcrossBlocks,
	normalizeInlineOffset,
	resolveBackspaceAction,
	resolveEnterAction,
	splitBlockAtOffset,
	toggleInlineMark,
} from "../field-editor/commands";
import { FieldEditorImpl } from "../field-editor/fieldEditorImpl";
import { FIELD_EDITOR_SLOT_KEY } from "../constants/fieldEditor";
import type { FieldEditorTextLike } from "../field-editor/crdt";

type BlocksMapLike = {
	get(key: string): { get(field: string): unknown } | undefined;
};

type RawDocLike = {
	getMap(name: string): BlocksMapLike;
};

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
}

function getYText(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
): FieldEditorTextLike {
	const adapter = editor.internals.adapter;
	const doc = editor.internals.crdtDoc;
	const ydoc = adapter.raw<RawDocLike>(doc);
	const ytext = ydoc
		.getMap("blocks")
		.get(blockId)
		?.get("content") as FieldEditorTextLike | null;
	if (!ytext) {
		throw new Error(`Missing test Y.Text for block ${blockId}`);
	}
	return ytext;
}

function editorOpts() {
	return {
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	};
}

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

	it("continues a numbered list with the next visible value on enter", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "convert-block",
				blockId,
				newType: "numberedListItem",
				newProps: { start: 3 },
			},
			{ type: "insert-text", blockId, offset: 0, text: "third" },
		]);

		const target = applyEnterBehavior(editor, {
			blockId,
			inputMode: "richtext",
			ytext: getYText(editor, blockId),
			range: { start: 5, end: 5 },
		});
		const newBlockId = editor.documentState.blockOrder[1];

		expect(target).toEqual({
			blockId: newBlockId,
			anchorOffset: 0,
			focusOffset: 0,
		});
		expect(editor.getBlock(newBlockId)?.type).toBe("numberedListItem");
		expect(getNumberedListItemValue(editor.getBlock(blockId))).toBe(3);
		expect(getNumberedListItemValue(editor.getBlock(newBlockId))).toBe(4);

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
		const editor = createEditor(editorOpts());
		const action = resolveEnterAction(editor, "x", "table", {
			length: 0,
			toString: () => "",
		});
		expect(action).toBeNull();
		editor.destroy();
	});

	it("returns null for none mode", () => {
		const editor = createEditor(editorOpts());
		const action = resolveEnterAction(editor, "x", "none", {
			length: 0,
			toString: () => "",
		});
		expect(action).toBeNull();
		editor.destroy();
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

	it("lifts an empty paragraph out of a toggle container", () => {
		const editor = createEditor(editorOpts());
		const toggleBlockId = editor.firstBlock()!.id;
		const childBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "convert-block",
				blockId: toggleBlockId,
				newType: "toggle",
			},
			{
				type: "insert-block",
				blockId: childBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: toggleBlockId },
			},
			{
				type: "update-block",
				blockId: childBlockId,
				props: { parentId: toggleBlockId },
			},
		]);

		const action = resolveEnterAction(
			editor,
			childBlockId,
			"richtext",
			getYText(editor, childBlockId),
		);
		expect(action).toEqual({ action: "lift" });

		editor.destroy();
	});

});
