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

describe("applyListTabBehavior", () => {
	it("Tab indents a list item when the previous sibling can own the nesting", () => {
		const editor = createEditor(editorOpts());
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "convert-block",
				blockId: firstBlockId,
				newType: "bulletListItem",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "bulletListItem",
				props: { indent: 0 },
				position: { after: firstBlockId },
			},
			{
				type: "insert-text",
				blockId: secondBlockId,
				offset: 0,
				text: "child",
			},
		]);

		const target = applyListTabBehavior(editor, {
			blockId: secondBlockId,
			ytext: getYText(editor, secondBlockId),
			range: { start: 2, end: 2 },
			shiftKey: false,
		});

		expect(target).toEqual({
			blockId: secondBlockId,
			anchorOffset: 2,
			focusOffset: 2,
		});
		expect(editor.getBlock(secondBlockId)?.props.indent).toBe(1);

		editor.destroy();
	});

	it("Tab returns null for a top-level list item without a parent candidate", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "bulletListItem" },
			{ type: "insert-text", blockId, offset: 0, text: "root" },
		]);

		const target = applyListTabBehavior(editor, {
			blockId,
			ytext: getYText(editor, blockId),
			range: { start: 4, end: 4 },
			shiftKey: false,
		});

		expect(target).toBeNull();
		expect(editor.getBlock(blockId)?.props.indent).toBe(0);

		editor.destroy();
	});

	it("Shift-Tab returns null for an already top-level list item", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "bulletListItem" },
			{ type: "insert-text", blockId, offset: 0, text: "root" },
		]);

		const target = applyListTabBehavior(editor, {
			blockId,
			ytext: getYText(editor, blockId),
			range: { start: 1, end: 3 },
			shiftKey: true,
		});

		expect(target).toBeNull();
		expect(editor.getBlock(blockId)?.props.indent).toBe(0);

		editor.destroy();
	});

	it("Shift-Tab outdents a nested list item", () => {
		const editor = createEditor(editorOpts());
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "convert-block",
				blockId: firstBlockId,
				newType: "bulletListItem",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "bulletListItem",
				props: { indent: 1 },
				position: { after: firstBlockId },
			},
			{
				type: "insert-text",
				blockId: secondBlockId,
				offset: 0,
				text: "child",
			},
		]);

		const target = applyListTabBehavior(editor, {
			blockId: secondBlockId,
			ytext: getYText(editor, secondBlockId),
			range: { start: 1, end: 3 },
			shiftKey: true,
		});

		expect(target).toEqual({
			blockId: secondBlockId,
			anchorOffset: 1,
			focusOffset: 3,
		});
		expect(editor.getBlock(secondBlockId)?.props.indent).toBe(0);

		editor.destroy();
	});

});
